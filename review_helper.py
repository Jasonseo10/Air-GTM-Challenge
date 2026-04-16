"""
Helper script called by the Next.js API to run the review step.

Usage:
    python review_helper.py <csv_path> [--today YYYY-MM-DD]

Outputs JSON to stdout with duplicate groups and dropped rows.
"""
import json
import sys
from datetime import date
from pathlib import Path

from src.pipeline import ingest_with_drops
from src.dedupe import find_duplicate_groups


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/messy_leads.csv")
    today = date.today()
    for i, arg in enumerate(sys.argv):
        if arg == "--today" and i + 1 < len(sys.argv):
            today = date.fromisoformat(sys.argv[i + 1])

    normalized, dropped_rows, total = ingest_with_drops(csv_path, today=today)
    unique, dup_groups = find_duplicate_groups(normalized)

    groups_out = []
    for g in dup_groups:
        groups_out.append({
            "email": g["email"],
            "rows": g["rows"],
            "proposed_merge": g["proposed_merge"],
        })

    result = {
        "total_rows": total,
        "valid_leads": len(normalized),
        "unique_leads": len(unique),
        "duplicate_groups": groups_out,
        "dropped_rows": dropped_rows,
    }
    print(json.dumps(result, default=str))


if __name__ == "__main__":
    main()
