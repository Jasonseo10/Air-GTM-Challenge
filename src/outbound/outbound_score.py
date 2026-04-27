"""
Config-driven outbound scoring.

Mirrors src/score.py's evaluator (same operator vocabulary, same
audit-trail shape) but reads from the *outbound* rule set, which excludes
product-usage signals by design — outbound prospects don't have them.

Tier thresholds and weights are loaded from the file pointed to by
config/outbound_scoring_rules.pointer.json so that promotions from the
closed-loop feedback step take effect on the next run without code
changes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_active_rules(pointer_path: str | Path,
                      rules_dir: Path | None = None) -> tuple[dict, str]:
    """
    Resolve the active rule set via the pointer file.

    Returns (rules_config, version_path_str). version_path_str is the path
    of the file actually loaded (useful for logging + UI display).
    """
    pointer_path = Path(pointer_path)
    pointer = json.loads(pointer_path.read_text(encoding="utf-8"))
    version_path = pointer["active_version"]
    # Allow rules_dir override for tests.
    base = rules_dir if rules_dir is not None else pointer_path.parent.parent
    full = base / version_path if not Path(version_path).is_absolute() else Path(version_path)
    if not full.exists():
        # Fallback: relative to pointer's parent.
        full = pointer_path.parent / Path(version_path).name
    rules = json.loads(full.read_text(encoding="utf-8"))
    return rules, str(full)


def load_rules_file(path: str | Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Operator evaluation — matches src/score.py
# ---------------------------------------------------------------------------

def _evaluate(rule: dict, value: Any) -> bool:
    op = rule["op"]
    target = rule.get("value")
    if op == "equals":
        return value == target
    if op == "not_equals":
        return value != target
    if op == "in":
        return value in (target or [])
    if op == "not_in":
        return value not in (target or [])
    if op == "gte":
        return isinstance(value, (int, float)) and value >= target
    if op == "gt":
        return isinstance(value, (int, float)) and value > target
    if op == "lte":
        return isinstance(value, (int, float)) and value <= target
    if op == "lt":
        return isinstance(value, (int, float)) and value < target
    if op == "between":
        lo, hi = target
        return isinstance(value, (int, float)) and lo <= value <= hi
    if op == "is_present":
        return value is not None and value is not False and value != ""
    if op == "is_absent":
        return value is None or value is False or value == ""
    raise ValueError(f"Unknown scoring operator: {op}")


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def score_lead(lead: dict, rules_config: dict) -> dict:
    """
    Returns a dict patch to apply: {outbound_score, outbound_tier,
    outbound_breakdown}. We don't mutate the lead so callers can decide.
    """
    total = 0
    breakdown = []
    matched_ids: list[str] = []
    for rule in rules_config["rules"]:
        value = lead.get(rule["field"])
        try:
            matched = _evaluate(rule, value)
        except Exception as exc:
            breakdown.append({
                "rule_id": rule["id"], "matched": False,
                "error": str(exc), "points": 0,
            })
            continue
        if matched:
            total += rule["points"]
            matched_ids.append(rule["id"])
            breakdown.append({
                "rule_id": rule["id"],
                "category": rule.get("category", ""),
                "matched": True,
                "points": rule["points"],
                "description": rule.get("description", ""),
            })

    tiers = rules_config["tiers"]
    if total >= tiers["hot"]:
        tier = "Hot"
    elif total >= tiers["warm"]:
        tier = "Warm"
    elif total >= tiers.get("cool", 15):
        tier = "Cool"
    else:
        tier = "Low"

    return {
        "outbound_score": total,
        "outbound_tier": tier,
        "outbound_breakdown": breakdown,
        "outbound_matched_rule_ids": matched_ids,
    }


def score_all(leads: list[dict], rules_config: dict) -> list[dict]:
    """Return a new list of leads with outbound_* fields attached."""
    out = []
    for lead in leads:
        merged = dict(lead)
        merged.update(score_lead(lead, rules_config))
        out.append(merged)
    return out
