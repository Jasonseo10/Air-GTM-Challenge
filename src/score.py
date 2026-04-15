"""
Config-driven lead scoring.

Rules live in config/scoring_rules.json so non-engineers can tune scoring
without touching code. Each rule is evaluated against a lead; matches add
points and produce an audit entry in `score_breakdown` so GTM can explain
any score.

Supported operators:
  equals, not_equals
  contains, contains_any          (string field)
  in, not_in                      (value in list)
  gte, gt, lte, lt                (numeric)
  between                         (numeric [lo, hi] inclusive)
  is_present, is_absent           (truthy check)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_rules(path: str | Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_field(lead: dict, field: str) -> Any:
    """Resolve scoring field names to values, including a few derived ones."""
    if field == "email_domain":
        email = lead.get("email") or ""
        return email.split("@", 1)[1] if "@" in email else None
    if field == "data_quality_issue_count":
        return len(lead.get("data_quality_issues") or [])
    return lead.get(field)


def _evaluate(rule: dict, value: Any) -> bool:
    op = rule["op"]
    target = rule.get("value")

    if op == "equals":
        return value == target
    if op == "not_equals":
        return value != target
    if op == "contains":
        return isinstance(value, str) and target in value
    if op == "contains_any":
        if not isinstance(value, str):
            return False
        return any(t.lower() in value.lower() for t in target)
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
        return bool(value)
    if op == "is_absent":
        return not value
    raise ValueError(f"Unknown scoring operator: {op}")


def score_lead(lead: dict, rules_config: dict) -> dict:
    """Return a new lead dict with `score`, `tier`, and `score_breakdown`."""
    total = 0
    breakdown = []
    for rule in rules_config["rules"]:
        value = _get_field(lead, rule["field"])
        try:
            matched = _evaluate(rule, value)
        except Exception as exc:  # malformed rule shouldn't crash the pipeline
            breakdown.append({
                "rule_id": rule["id"],
                "matched": False,
                "error": str(exc),
                "points": 0,
            })
            continue
        if matched:
            total += rule["points"]
            breakdown.append({
                "rule_id": rule["id"],
                "matched": True,
                "points": rule["points"],
                "description": rule.get("description", ""),
            })

    tiers = rules_config["tiers"]
    if total >= tiers["hot"]:
        tier = "Hot"
    elif total >= tiers["warm"]:
        tier = "Warm"
    else:
        tier = "Cold"

    out = dict(lead)
    out["score"] = total
    out["tier"] = tier
    out["score_breakdown"] = breakdown
    return out
