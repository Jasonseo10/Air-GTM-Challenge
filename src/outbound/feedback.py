"""
Closed-loop feedback: read disposition outcomes, refit scoring weights
and rep affinity, and propose a new rule-set version.

Two outputs:

1. **Rule-weight refit.** For every rule in the active outbound rule set,
   compute lift = P(closed_won | rule_matched) / P(closed_won | baseline).
   Apply EMA blending so weights don't whiplash on small samples:
       new_weight = clamp( current * (alpha + (1-alpha) * lift), min, max )
   Rules with fewer than `min_sample` matched leads are flagged as
   "insufficient evidence" and skipped — surfaced in the UI but not auto-
   applied.

2. **Rep affinity matrix.** For each rep × (vertical, persona) pair, count
   wins from disposition history. Drives the heatmap on the Rep Affinity
   tab and feeds back into match.py's past_wins lift term.

Promotion is *not* automatic. This module produces a proposed version
file plus a delta report; the dashboard's Promote button calls the
promotion route which updates config/outbound_scoring_rules.pointer.json.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Disposition loading
# ---------------------------------------------------------------------------

WIN_OUTCOMES = {"closed_won"}
ENGAGED_OUTCOMES = {"closed_won", "opp_created", "meeting_booked", "replied"}
TERMINAL_OUTCOMES = {"closed_won", "closed_lost", "disqualified", "no_response"}


def load_dispositions(path: str | Path) -> list[dict]:
    """Read dispositions CSV. Coerces numeric fields."""
    rows: list[dict] = []
    with open(path, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            row["days_to_outcome"] = int(row.get("days_to_outcome") or 0)
            row["acv_usd"] = int(row.get("acv_usd") or 0)
            rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# Refit
# ---------------------------------------------------------------------------

@dataclass
class WeightUpdate:
    rule_id: str
    description: str
    old_weight: int
    new_weight: int
    matched_n: int
    won_n: int
    win_rate: float
    baseline_win_rate: float
    lift: float
    sufficient_evidence: bool
    note: str

    def to_dict(self) -> dict:
        return self.__dict__


def refit_weights(rules_config: dict, leads_scored: list[dict],
                  dispositions: list[dict],
                  alpha: float = 0.7,
                  min_sample: int = 8,
                  weight_floor: int = 1,
                  weight_ceiling: int = 30) -> list[WeightUpdate]:
    """
    Recompute outbound rule weights using disposition outcomes.

    `leads_scored` must be the leads as scored by outbound_score.score_all
    (so we know which rules matched each lead). `dispositions` is the
    historical CRM data keyed by lead_email.
    """
    # Index: lead_email -> matched_rule_ids
    matched_by_email: dict[str, list[str]] = {}
    for l in leads_scored:
        matched_by_email[(l.get("email") or "").lower()] = list(
            l.get("outbound_matched_rule_ids") or []
        )

    # Filter dispositions to those whose lead is in our universe AND who
    # reached a terminal state (no_response / won / lost / disqualified).
    terminal = [d for d in dispositions
                if d.get("outcome") in TERMINAL_OUTCOMES
                and (d.get("lead_email") or "").lower() in matched_by_email]
    if not terminal:
        return []

    total_n = len(terminal)
    total_won = sum(1 for d in terminal if d["outcome"] in WIN_OUTCOMES)
    baseline = total_won / total_n if total_n else 0.0

    # Per-rule aggregation.
    by_rule: dict[str, dict] = defaultdict(lambda: {"matched_n": 0, "won_n": 0})
    for d in terminal:
        email = (d["lead_email"] or "").lower()
        won = d["outcome"] in WIN_OUTCOMES
        for rule_id in matched_by_email.get(email, []):
            by_rule[rule_id]["matched_n"] += 1
            if won:
                by_rule[rule_id]["won_n"] += 1

    updates: list[WeightUpdate] = []
    for rule in rules_config["rules"]:
        rid = rule["id"]
        agg = by_rule.get(rid, {"matched_n": 0, "won_n": 0})
        matched_n = agg["matched_n"]
        won_n = agg["won_n"]
        win_rate = (won_n / matched_n) if matched_n else 0.0
        lift = (win_rate / baseline) if baseline > 0 and matched_n > 0 else 1.0

        sufficient = matched_n >= min_sample
        old_w = rule["points"]
        if sufficient:
            blended = old_w * (alpha + (1 - alpha) * lift)
            new_w = max(weight_floor, min(weight_ceiling, round(blended)))
            note = f"refit on {matched_n} samples, win rate {win_rate:.1%} vs baseline {baseline:.1%}"
        else:
            new_w = old_w
            note = (f"insufficient evidence ({matched_n} < {min_sample}) — "
                    f"weight unchanged")

        updates.append(WeightUpdate(
            rule_id=rid,
            description=rule.get("description", ""),
            old_weight=old_w,
            new_weight=new_w,
            matched_n=matched_n,
            won_n=won_n,
            win_rate=win_rate,
            baseline_win_rate=baseline,
            lift=lift,
            sufficient_evidence=sufficient,
            note=note,
        ))
    return updates


def apply_updates(rules_config: dict, updates: list[WeightUpdate]) -> dict:
    """Return a NEW rules_config dict with new_weight values applied."""
    by_id = {u.rule_id: u for u in updates}
    new = json.loads(json.dumps(rules_config))  # deep copy via JSON round-trip
    for rule in new["rules"]:
        u = by_id.get(rule["id"])
        if u and u.sufficient_evidence:
            rule["points"] = u.new_weight
    new["version"] = (new.get("version") or 1) + 1
    new["refit_at"] = datetime.now(timezone.utc).isoformat()
    return new


# ---------------------------------------------------------------------------
# Rep affinity matrix
# ---------------------------------------------------------------------------

def compute_rep_affinity(dispositions: list[dict],
                         leads_scored: list[dict]) -> dict:
    """
    rep_affinity[rep_id][vertical][persona_bucket] = {n, won_n, win_rate, avg_acv}

    Persona bucket is coarse: C-Level, VP, Director, Manager, Other.
    Vertical comes from the lead's outbound_vertical at the time of the
    disposition.
    """
    lead_by_email: dict[str, dict] = {}
    for l in leads_scored:
        lead_by_email[(l.get("email") or "").lower()] = l

    SEN_BUCKETS = {"C-Level": "C-Level", "VP": "VP",
                   "Director": "Director", "Manager": "Manager"}

    affinity: dict[str, dict[str, dict[str, dict]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(
            lambda: {"n": 0, "won_n": 0, "won_acv_total": 0}
        ))
    )

    for d in dispositions:
        email = (d.get("lead_email") or "").lower()
        lead = lead_by_email.get(email)
        if not lead:
            continue
        vert = lead.get("outbound_vertical") or "Other"
        sen = SEN_BUCKETS.get(lead.get("seniority_level") or "", "Other")
        cell = affinity[d["rep_id"]][vert][sen]
        cell["n"] += 1
        if d.get("outcome") in WIN_OUTCOMES:
            cell["won_n"] += 1
            cell["won_acv_total"] += d.get("acv_usd", 0)

    # Finalize: compute win_rate and avg_acv.
    result: dict = {}
    for rep_id, by_vert in affinity.items():
        result[rep_id] = {}
        for vert, by_sen in by_vert.items():
            result[rep_id][vert] = {}
            for sen, cell in by_sen.items():
                n = cell["n"]
                won = cell["won_n"]
                result[rep_id][vert][sen] = {
                    "n": n,
                    "won_n": won,
                    "win_rate": (won / n) if n else 0.0,
                    "avg_acv": (cell["won_acv_total"] / won) if won else 0,
                }
    return result


# ---------------------------------------------------------------------------
# Promotion (versioned + pointer)
# ---------------------------------------------------------------------------

def promote_new_rules(new_rules: dict,
                      pointer_path: str | Path,
                      rules_dir: str | Path,
                      promoted_by: str = "dashboard",
                      note: str = "") -> str:
    """
    Write `new_rules` to a versioned file and update the pointer.
    Returns the relative version path that was written.
    """
    pointer_path = Path(pointer_path)
    rules_dir = Path(rules_dir)
    pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
    version = new_rules.get("version", 1)
    fname = f"outbound_scoring_rules.v{version}.json"
    full = rules_dir / fname
    full.write_text(json.dumps(new_rules, indent=2), encoding="utf-8")

    rel = f"config/{fname}"
    pointer["active_version"] = rel
    pointer.setdefault("history", []).append({
        "version_path": rel,
        "promoted_at": datetime.now(timezone.utc).isoformat(),
        "promoted_by": promoted_by,
        "note": note or f"v{version} promoted from dashboard refit",
    })
    pointer_path.write_text(json.dumps(pointer, indent=2), encoding="utf-8")
    return rel
