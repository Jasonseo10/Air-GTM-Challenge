"""
Config-driven lead scoring with conditional (`when`) clauses and category
tagging.

Rules live in config/scoring_rules.json so non-engineers can tune scoring
without touching code. Each rule is evaluated against a lead; matches add
points and produce an audit entry in `score_breakdown` so GTM can explain
any score.

Each rule may declare:
    id            unique string
    description   human-readable rationale (shown in audit trail + dashboard)
    category      one of: intent, fit, persona, expansion
    field         field on the lead to test
    op            operator (see below)
    value         operator argument
    points        score awarded if rule matches
    when          optional list of sub-conditions — ALL must pass before the
                  main rule is evaluated. Each sub-condition has the same
                  {field, op, value} shape as a rule.

Supported operators:
  equals, not_equals
  contains, contains_any          (string field)
  in, not_in                      (value in list)
  gte, gt, lte, lt                (numeric)
  between                         (numeric [lo, hi] inclusive)
  is_present, is_absent           (truthy check)

Why categories matter:
  We split scoring into four buckets so the breakdown can show *why* a lead
  scored high, not just what the number is. Two leads with score 80 can have
  very different shapes — one all Intent, one all Fit — and a seller should
  treat them differently. Categories let the dashboard render that.

    intent     — behavioral / product-usage signals (what they're doing)
    fit        — firmographic match (who the company is)
    persona    — title / seniority / buyer profile (who the person is)
    expansion  — growth or whitespace signals (where the account could go)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CATEGORIES = ("intent", "fit", "persona", "expansion")


def load_rules(path: str | Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_field(lead: dict, field: str) -> Any:
    """Resolve scoring field names, including a few derived ones."""
    if field == "email_domain":
        email = lead.get("email") or ""
        return email.split("@", 1)[1] if "@" in email else None
    if field == "data_quality_issue_count":
        return len(lead.get("data_quality_issues") or [])
    if field == "detected_tools_count":
        return len(lead.get("detected_tools") or [])
    return lead.get(field)


def _evaluate(op: str, value: Any, target: Any) -> bool:
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


def _check_condition(lead: dict, cond: dict) -> bool:
    return _evaluate(cond["op"], _get_field(lead, cond["field"]), cond.get("value"))


def score_lead(lead: dict, rules_config: dict) -> dict:
    """Return a new lead dict with `score`, `tier`, `score_breakdown`, and
    `score_by_category` (counts per-category points so the UI can render
    a diversified view of why a lead scored the way it did)."""
    total = 0
    breakdown = []
    by_category = {c: 0 for c in CATEGORIES}

    for rule in rules_config["rules"]:
        # `when` gate — all sub-conditions must pass or the rule is skipped.
        # This is how we encode context-aware rules (e.g. "C-level but only
        # at small companies") without combinatorial explosion.
        gate_conditions = rule.get("when") or []
        gate_passed = True
        for cond in gate_conditions:
            try:
                if not _check_condition(lead, cond):
                    gate_passed = False
                    break
            except Exception:
                gate_passed = False
                break
        if not gate_passed:
            continue

        try:
            matched = _evaluate(
                rule["op"],
                _get_field(lead, rule["field"]),
                rule.get("value"),
            )
        except Exception as exc:
            # Malformed rule shouldn't crash the pipeline.
            breakdown.append({
                "rule_id": rule["id"],
                "matched": False,
                "error": str(exc),
                "points": 0,
            })
            continue

        if matched:
            category = rule.get("category", "fit")
            points = rule["points"]
            total += points
            by_category[category] = by_category.get(category, 0) + points
            breakdown.append({
                "rule_id": rule["id"],
                "matched": True,
                "category": category,
                "points": points,
                "description": rule.get("description", ""),
                "conditional": bool(gate_conditions),
            })

    tiers = rules_config["tiers"]
    if total >= tiers["hot"]:
        tier = "Hot"
    elif total >= tiers["warm"]:
        tier = "Warm"
    elif total >= tiers.get("cool", 35):
        tier = "Cool"
    else:
        tier = "Low"

    out = dict(lead)
    out["score"] = total
    out["tier"] = tier
    out["score_breakdown"] = breakdown
    out["score_by_category"] = by_category
    return out
