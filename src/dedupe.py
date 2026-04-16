"""
Deduplicate leads by normalized email.

Strategy: group rows by their normalized email. Within each group, merge
non-empty fields, preferring the longest (most complete) value for each
column. This preserves the most information when the same lead appears
multiple times with slightly different data (e.g., one row has a phone,
another has a country).

We do NOT merge across different emails even if names match — email is the
canonical identity for CRM ingestion, and name matches are unreliable.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Iterable


def _pick_best(values: list[str | None]) -> str | None:
    """Return the longest non-empty string; None if all empty."""
    candidates = [v for v in values if v]
    if not candidates:
        return None
    # Longest tends to mean most complete ("Senior Engineer" > "Senior").
    # Stable on ties so we pick the first seen.
    return max(candidates, key=len)


def find_duplicate_groups(leads: Iterable[dict]) -> tuple[list[dict], list[dict]]:
    """
    Identify duplicate groups without merging.

    Returns (unique_leads, duplicate_groups) where each group is a dict:
      {"email": str, "rows": [lead, ...], "proposed_merge": lead}
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for lead in leads:
        email = lead.get("email")
        if not email:
            continue
        groups[email].append(lead)

    unique: list[dict] = []
    dup_groups: list[dict] = []

    for email, group in groups.items():
        if len(group) == 1:
            unique.append(group[0])
            continue

        # Build the proposed merge (same logic as dedupe_by_email).
        keys = set().union(*(row.keys() for row in group))
        combined: dict = {}
        for key in keys:
            if key == "data_quality_issues":
                issues: list[str] = []
                for row in group:
                    issues.extend(row.get(key) or [])
                combined[key] = sorted(set(issues))
            elif key == "source_row_numbers":
                combined[key] = sorted(
                    n for row in group for n in (row.get(key) or [])
                )
            else:
                combined[key] = _pick_best([row.get(key) for row in group])
        combined["merged_from_n_rows"] = len(group)

        dup_groups.append({
            "email": email,
            "rows": group,
            "proposed_merge": combined,
        })

    return unique, dup_groups


def dedupe_by_email(leads: Iterable[dict]) -> tuple[list[dict], int]:
    """
    Merge leads that share a normalized email.

    Returns (merged_leads, num_duplicates_collapsed).
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for lead in leads:
        email = lead.get("email")
        if not email:
            # Shouldn't happen — caller drops invalid-email rows first — but
            # be defensive.
            continue
        groups[email].append(lead)

    merged: list[dict] = []
    duplicates_collapsed = 0

    for email, group in groups.items():
        if len(group) == 1:
            merged.append(group[0])
            continue

        duplicates_collapsed += len(group) - 1
        # Union of keys — all rows should have the same schema, but be safe.
        keys = set().union(*(row.keys() for row in group))
        combined: dict = {}
        for key in keys:
            if key == "data_quality_issues":
                # Union the issue lists so downstream sees every flag.
                issues: list[str] = []
                for row in group:
                    issues.extend(row.get(key) or [])
                combined[key] = sorted(set(issues))
            elif key == "source_row_numbers":
                # Track provenance for auditing.
                combined[key] = sorted(
                    n for row in group for n in (row.get(key) or [])
                )
            else:
                combined[key] = _pick_best([row.get(key) for row in group])

        # Mark merged records so the summary can report on them.
        combined["merged_from_n_rows"] = len(group)
        merged.append(combined)

    return merged, duplicates_collapsed
