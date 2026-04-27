"""
One-shot generator for data/dispositions.csv.

Produces ~120 mocked CRM disposition records covering the existing
lead set. Outcomes are engineered with deliberate biases so the closed-
loop refit produces *visibly meaningful* deltas in the demo:

    Bias                                              Effect on win rate
    ------------------------------------------------  ------------------
    funding_recent matched                            +0.35
    competitor_dam matched                            +0.40
    exec_hire_marketing OR creative                   +0.25
    creative_hiring_spike                             +0.15
    rebrand_or_campaign_launch                        +0.10
    agency_change                                     +0.20
    ad_spend_increase (alone)                          0.00  (noise)
    channel_expansion_new (alone)                     -0.05  (anti-signal)
    rep vertical match                                +0.20
    rep persona match                                 +0.15
    rep over-capacity at assignment time              -0.20
    ramping rep                                       -0.15
    Base rate                                          0.08

Run with:
    py -m src.outbound._gen_dispositions
"""

from __future__ import annotations

import csv
import hashlib
import json
import random
from datetime import date, timedelta
from pathlib import Path

from .signals import attach_outbound_attributes
from .outbound_score import load_active_rules, score_all
from .match import load_team, route_all


REPO_ROOT = Path(__file__).resolve().parents[2]


def _stable_hash(s: str) -> int:
    return int(hashlib.md5(s.encode("utf-8")).hexdigest(), 16)


def _sample_outcome(win_prob: float, rng: random.Random) -> str:
    r = rng.random()
    if r < win_prob:
        return "closed_won"
    # Distribute the rest by win_prob: higher win_prob => more engagement.
    rem = (r - win_prob) / max(0.001, 1 - win_prob)
    if win_prob >= 0.45:
        # Strong leads — even losses tend to be late-funnel.
        if rem < 0.30: return "opp_created"
        if rem < 0.55: return "meeting_booked"
        if rem < 0.80: return "replied"
        if rem < 0.95: return "closed_lost"
        return "no_response"
    elif win_prob >= 0.20:
        if rem < 0.20: return "opp_created"
        if rem < 0.40: return "meeting_booked"
        if rem < 0.55: return "replied"
        if rem < 0.85: return "no_response"
        return "disqualified"
    else:
        if rem < 0.05: return "meeting_booked"
        if rem < 0.15: return "replied"
        if rem < 0.85: return "no_response"
        return "disqualified"


def _reason_for_outcome(outcome: str, signals: list[dict],
                        rng: random.Random) -> str:
    sig_types = [s["signal_type"] for s in signals]
    if outcome == "closed_won":
        if "competitor_dam_in_stack" in sig_types:
            return "competitor replacement, signed annual"
        if "funding_recent" in sig_types:
            return "post-funding budget, fast cycle"
        if any(s.startswith("exec_hire") for s in sig_types):
            return "new exec consolidated tooling"
        return "good fit, healthy mutual interest"
    if outcome == "opp_created":
        return "qualified, in eval"
    if outcome == "meeting_booked":
        return "discovery booked"
    if outcome == "replied":
        return rng.choice(["asked for materials", "deferred 60d", "intro to team"])
    if outcome == "closed_lost":
        return rng.choice(["lost to incumbent", "no budget", "stalled"])
    if outcome == "disqualified":
        return rng.choice(["wrong persona", "company too small", "out of ICP"])
    return "no engagement"


def _acv_for_won(lead: dict, rng: random.Random) -> int:
    size = lead.get("company_size_min") or 0
    if size >= 5000:
        return 200_000 + rng.randint(0, 100_000)
    if size >= 1000:
        return 100_000 + rng.randint(0, 60_000)
    if size >= 500:
        return 60_000 + rng.randint(0, 30_000)
    if size >= 200:
        return 35_000 + rng.randint(0, 20_000)
    if size >= 50:
        return 18_000 + rng.randint(0, 12_000)
    return 8_000 + rng.randint(0, 8_000)


def main() -> int:
    rng = random.Random(42)

    # Load + score + route the existing leads so we know which rep each
    # lead would have gone to and which signals attach to each account.
    leads = json.loads((REPO_ROOT / "output" / "clean_leads.json")
                       .read_text(encoding="utf-8"))
    enriched, _ = attach_outbound_attributes(leads)
    rules, _ = load_active_rules(REPO_ROOT / "config" /
                                 "outbound_scoring_rules.pointer.json")
    scored = score_all(enriched, rules)
    reps, fairness = load_team(REPO_ROOT / "config" / "sales_team.json")
    routed = route_all(scored, reps, fairness)
    rep_by_id = {r.rep_id: r for r in reps}
    routed_by_email = {r.lead_email: r for r in routed}

    # We'll generate dispositions for every routed lead (Hot/Warm/Cool)
    # plus a small random sample of Low-tier leads to represent failed
    # outreach attempts. Target ~120 total.
    today = date(2026, 4, 26)
    rows: list[dict] = []

    def emit_for_lead(lead: dict, rep_id: str, signals: list[dict]) -> None:
        sig_types = {s["signal_type"] for s in signals}
        rep = rep_by_id[rep_id]

        win_prob = 0.05
        if "funding_recent" in sig_types: win_prob += 0.18
        if "competitor_dam_in_stack" in sig_types: win_prob += 0.22
        if any(s in sig_types for s in
               ("exec_hire_marketing", "exec_hire_creative")):
            win_prob += 0.13
        if "creative_hiring_spike" in sig_types: win_prob += 0.07
        if "rebrand_or_campaign" in sig_types: win_prob += 0.04
        if "agency_change" in sig_types: win_prob += 0.10
        # ad_spend_ramp alone is engineered as noise: no bump.
        if "channel_expansion_new" in sig_types and len(sig_types) == 1:
            win_prob -= 0.03  # actively misleading on its own

        # Rep-side contributions.
        vert = lead.get("outbound_vertical")
        if vert and vert in rep.verticals: win_prob += 0.10
        title_l = (lead.get("title") or "").lower()
        if any(p.lower() in title_l for p in rep.persona_strength):
            win_prob += 0.08
        if rep.utilization_pct >= 90: win_prob -= 0.10
        if rep.ramp_status == "ramping": win_prob -= 0.08

        win_prob = max(0.02, min(0.75, win_prob))

        outcome = _sample_outcome(win_prob, rng)
        days_to = rng.randint(2, 90) if outcome != "no_response" else rng.randint(14, 60)
        won_date = (today - timedelta(days=rng.randint(0, 180))).isoformat() \
            if outcome == "closed_won" else ""
        acv = _acv_for_won(lead, rng) if outcome == "closed_won" else 0

        rows.append({
            "lead_email": lead["email"],
            "account_id": lead["account_id"],
            "rep_id": rep_id,
            "outcome": outcome,
            "days_to_outcome": days_to,
            "reason": _reason_for_outcome(outcome, signals, rng),
            "acv_usd": acv,
            "won_date": won_date,
        })

    # All routed leads get one disposition.
    for lead in scored:
        rl = routed_by_email.get(lead["email"])
        if not rl:
            # Low tier — sample 20% to represent some attempted outreach
            # that found no traction.
            if rng.random() < 0.20:
                # Pick the rep that would have matched anyway via simple round-robin.
                rep_id = reps[_stable_hash(lead["email"]) % len(reps)].rep_id
                # Force outcome distribution toward no_response/disqualified.
                lead = dict(lead)  # shallow copy
                rows.append({
                    "lead_email": lead["email"],
                    "account_id": lead.get("account_id", ""),
                    "rep_id": rep_id,
                    "outcome": rng.choice(["no_response", "no_response",
                                           "disqualified"]),
                    "days_to_outcome": rng.randint(20, 75),
                    "reason": "out of ICP / no engagement",
                    "acv_usd": 0,
                    "won_date": "",
                })
            continue
        emit_for_lead(lead, rl.rep_id, lead.get("signals") or [])

    out_path = REPO_ROOT / "data" / "dispositions.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "lead_email", "account_id", "rep_id", "outcome",
            "days_to_outcome", "reason", "acv_usd", "won_date",
        ])
        writer.writeheader()
        writer.writerows(rows)

    # Print quick summary.
    from collections import Counter
    outcomes = Counter(r["outcome"] for r in rows)
    by_rep = Counter(r["rep_id"] for r in rows)
    print(f"Wrote {len(rows)} dispositions to {out_path}")
    print("Outcome distribution:")
    for o, n in outcomes.most_common():
        print(f"  {o}: {n}")
    print("Per-rep load:")
    for r, n in by_rep.most_common():
        print(f"  {r}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
