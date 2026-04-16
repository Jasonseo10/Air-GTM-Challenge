"""
Helper script called by the Next.js API after the user reviews merges/deletions.

Usage:
    python finalize_helper.py <csv_path> [--today YYYY-MM-DD] [--seed N]

Reads review decisions from stdin as JSON:
{
    "approved_merges": ["email1@x.com", ...],     # emails to merge
    "rejected_merges": ["email2@x.com", ...],     # emails to keep separate
    "restored_drops": [{"row_num": N, "raw": {...}}, ...]  # dropped rows to restore
}

Runs: apply decisions -> dedupe (approved only) -> enrich -> score -> emit.
Outputs JSON stats to stdout.
"""
import json
import logging
import random
import sys
from datetime import date
from pathlib import Path

from src.pipeline import ingest_with_drops, write_clean_csv, write_clean_json, build_summary
from src.dedupe import find_duplicate_groups, dedupe_by_email
from src import enrich, score, salesforce, normalize

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("data/messy_leads.csv")
    seed = 42
    today = date.today()
    for i, arg in enumerate(sys.argv):
        if arg == "--today" and i + 1 < len(sys.argv):
            today = date.fromisoformat(sys.argv[i + 1])
        if arg == "--seed" and i + 1 < len(sys.argv):
            seed = int(sys.argv[i + 1])

    # Read decisions from stdin.
    decisions = json.loads(sys.stdin.read())
    approved_merges = set(decisions.get("approved_merges", []))
    rejected_merges = set(decisions.get("rejected_merges", []))
    restored_drops = decisions.get("restored_drops", [])

    # 1. Ingest + normalize (same as review step).
    normalized, dropped_rows, total_rows = ingest_with_drops(csv_path, today=today)

    # 2. Restore any drops the user wants to keep.
    #    Re-normalize the raw data for restored rows.  If they still fail
    #    email validation we skip them (they truly can't be used).
    restored_count = 0
    for drop in restored_drops:
        raw = drop.get("raw", {})
        row_num = drop.get("row_num", 0)
        lead = None
        # Try normalizing the raw row — the email might still be bad.
        email_raw = raw.get("Email", "")
        email_clean = normalize.normalize_email(email_raw)
        if email_clean:
            from src.pipeline import normalize_row
            lead = normalize_row(raw, row_num=row_num, today=today)
        if lead:
            normalized.append(lead)
            restored_count += 1

    # 3. Apply dedupe decisions.
    unique, dup_groups = find_duplicate_groups(normalized)

    final_leads = list(unique)
    duplicates_collapsed = 0
    for group in dup_groups:
        email = group["email"]
        if email in approved_merges:
            # Merge as proposed.
            final_leads.append(group["proposed_merge"])
            duplicates_collapsed += len(group["rows"]) - 1
        else:
            # Keep all rows as separate leads.
            final_leads.extend(group["rows"])

    # 4. Enrich.
    cfg = enrich.EnrichmentConfig()
    rng = random.Random(seed)
    enriched = [enrich.enrich_lead(l, cfg=cfg, rng=rng) for l in final_leads]

    # 5. Score.
    rules_path = Path("config/scoring_rules.json")
    rules = score.load_rules(rules_path)
    scored = [score.score_lead(l, rules) for l in enriched]
    scored.sort(key=lambda l: l["score"], reverse=True)

    # 6. Emit.
    output_dir = Path("output")
    output_dir.mkdir(parents=True, exist_ok=True)
    write_clean_csv(scored, output_dir / "clean_leads.csv")
    write_clean_json(scored, output_dir / "clean_leads.json")
    salesforce.write_salesforce_csv(scored, output_dir / "salesforce_leads.csv")
    salesforce.write_salesforce_json(scored, output_dir / "salesforce_leads.json")
    salesforce.write_field_mapping(output_dir / "salesforce_field_mapping.json")

    summary = build_summary(
        total_rows=total_rows,
        dropped_invalid=len(dropped_rows) - restored_count,
        after_dedupe=len(final_leads),
        duplicates_collapsed=duplicates_collapsed,
        leads=scored,
    )
    (output_dir / "summary_report.md").write_text(summary, encoding="utf-8")

    stats = {
        "total_rows": total_rows,
        "restored_drops": restored_count,
        "duplicates_collapsed": duplicates_collapsed,
        "final_leads": len(scored),
        "enriched_ok": sum(1 for l in scored if l.get("enrichment_status") == "ok"),
    }
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
