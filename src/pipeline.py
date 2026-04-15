"""
End-to-end pipeline: ingest -> normalize -> dedupe -> enrich -> score -> emit.

Designed to be readable top-to-bottom so a reviewer can follow the flow
without jumping between files. Each stage logs counts so failures are easy
to localize.
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import random
import sys
from collections import Counter
from datetime import date
from pathlib import Path
from statistics import mean
from typing import Optional

from . import normalize, dedupe, enrich, score, salesforce

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Ingest + per-row normalization
# ---------------------------------------------------------------------------

RAW_TO_CANONICAL = {
    "Name": "name",
    "Email": "email",
    "Title": "title",
    "Company": "company",
    "Phone": "phone",
    "Source": "source",
    "Country": "country",
    "Created At": "created_at",
}


def normalize_row(raw: dict, row_num: int, today: date) -> Optional[dict]:
    """
    Normalize one CSV row. Returns None if the row has no usable email
    (our only hard-drop rule — email is non-negotiable for CRM ingestion).
    """
    issues: list[str] = []

    name = normalize.normalize_name(raw.get("Name"))
    if not name:
        issues.append("missing_name")

    email = normalize.normalize_email(raw.get("Email"))
    if not email:
        # Hard drop: without email we can't dedupe, enrich, or load into SF.
        return None

    title = normalize.normalize_title(raw.get("Title"))
    if not title:
        issues.append("missing_title")

    company = normalize.normalize_company(raw.get("Company"))
    if not company:
        issues.append("missing_company")

    phone = normalize.normalize_phone(raw.get("Phone"))
    if not phone:
        issues.append("missing_or_invalid_phone")

    source = normalize.normalize_source(raw.get("Source"))
    if not source:
        issues.append("missing_source")

    country = normalize.normalize_country(raw.get("Country"))
    if not country:
        issues.append("missing_or_unknown_country")

    created_at = normalize.normalize_date(raw.get("Created At"), today=today)
    if not created_at:
        issues.append("missing_or_invalid_created_at")

    return {
        "name": name,
        "email": email,
        "title": title,
        "company": company,
        "phone": phone,
        "source": source,
        "country": country,
        "created_at": created_at,
        "data_quality_issues": issues,
        "source_row_numbers": [row_num],
    }


def ingest(csv_path: Path, today: date) -> tuple[list[dict], int, int]:
    """
    Read the CSV and normalize each row.

    Returns (normalized_leads, total_rows_read, dropped_invalid_email_count).
    """
    normalized: list[dict] = []
    total = 0
    dropped = 0
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader, start=2):  # start=2 because row 1 is header
            total += 1
            lead = normalize_row(row, row_num=i, today=today)
            if lead is None:
                dropped += 1
                logger.info("row %d dropped: invalid/missing email (raw=%r)",
                            i, row.get("Email"))
                continue
            normalized.append(lead)
    return normalized, total, dropped


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

# Columns for the human-readable CSV — ordered for scanability.
CLEAN_CSV_COLUMNS = [
    "email", "name", "title", "seniority_level", "company",
    "industry", "company_size_band", "estimated_revenue",
    "phone", "country", "source", "created_at",
    "score", "tier",
    "enrichment_status", "enrichment_error",
    "data_quality_issues", "merged_from_n_rows",
]


def write_clean_csv(leads: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CLEAN_CSV_COLUMNS,
                                extrasaction="ignore")
        writer.writeheader()
        for lead in leads:
            row = dict(lead)
            row["data_quality_issues"] = "; ".join(lead.get("data_quality_issues") or [])
            writer.writerow(row)


def write_clean_json(leads: list[dict], path: Path) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(leads, f, indent=2, default=str)


# ---------------------------------------------------------------------------
# Summary report
# ---------------------------------------------------------------------------

def build_summary(total_rows: int, dropped_invalid: int, after_dedupe: int,
                  duplicates_collapsed: int, leads: list[dict]) -> str:
    n = len(leads)
    enriched_ok = sum(1 for l in leads if l.get("enrichment_status") == "ok")
    enrichment_pct = (enriched_ok / n * 100) if n else 0.0
    avg_score = mean(l["score"] for l in leads) if leads else 0.0

    tiers = Counter(l["tier"] for l in leads)
    sources = Counter(l.get("source") or "(missing)" for l in leads)
    countries = Counter(l.get("country") or "(missing)" for l in leads)
    industries = Counter(l.get("industry") or "(missing)" for l in leads)

    # Data quality histogram
    issue_counter: Counter = Counter()
    for lead in leads:
        for issue in lead.get("data_quality_issues") or []:
            issue_counter[issue] += 1

    top_leads = sorted(leads, key=lambda l: l["score"], reverse=True)[:10]

    lines = []
    lines.append("# Lead Pipeline Summary Report")
    lines.append("")
    lines.append("## Volume")
    lines.append(f"- Rows read from source: **{total_rows}**")
    lines.append(f"- Dropped (invalid/missing email): **{dropped_invalid}**")
    lines.append(f"- Duplicate rows collapsed: **{duplicates_collapsed}**")
    lines.append(f"- Unique leads after dedupe: **{after_dedupe}**")
    lines.append(f"- Final leads in output: **{n}**")
    lines.append("")
    lines.append("## Enrichment")
    lines.append(f"- Successfully enriched: **{enriched_ok} / {n} ({enrichment_pct:.1f}%)**")
    lines.append(f"- Failed (after retry): **{n - enriched_ok}**")
    lines.append("")
    lines.append("## Scoring")
    lines.append(f"- Average score: **{avg_score:.1f}**")
    lines.append(f"- Hot: **{tiers.get('Hot', 0)}**")
    lines.append(f"- Warm: **{tiers.get('Warm', 0)}**")
    lines.append(f"- Cold: **{tiers.get('Cold', 0)}**")
    lines.append("")
    lines.append("## Data Quality Issues (count of leads flagged)")
    for issue, count in issue_counter.most_common():
        lines.append(f"- `{issue}`: {count}")
    if not issue_counter:
        lines.append("- None 🎉")
    lines.append("")
    lines.append("## Source Breakdown")
    for src, count in sources.most_common():
        lines.append(f"- {src}: {count}")
    lines.append("")
    lines.append("## Country Breakdown")
    for c, count in countries.most_common():
        lines.append(f"- {c}: {count}")
    lines.append("")
    lines.append("## Industry Breakdown")
    for ind, count in industries.most_common():
        lines.append(f"- {ind}: {count}")
    lines.append("")
    lines.append("## Top 10 Leads by Score")
    lines.append("")
    lines.append("| Rank | Email | Name | Company | Title | Score | Tier |")
    lines.append("|------|-------|------|---------|-------|-------|------|")
    for i, lead in enumerate(top_leads, start=1):
        lines.append(
            f"| {i} | {lead.get('email')} | {lead.get('name') or ''} | "
            f"{lead.get('company') or ''} | {lead.get('title') or ''} | "
            f"{lead['score']} | {lead['tier']} |"
        )
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(input_csv: Path, output_dir: Path, rules_path: Path,
        seed: int = 42, today: Optional[date] = None) -> dict:
    """
    Execute the full pipeline. Returns a small dict of stats for programmatic
    callers (tests, CI). Side effects: writes all output files.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(seed)  # deterministic enrichment "network" behavior
    today = today or date.today()

    # 1. Ingest + normalize
    normalized, total_rows, dropped_invalid = ingest(input_csv, today=today)
    logger.info("ingested %d rows, dropped %d, keeping %d",
                total_rows, dropped_invalid, len(normalized))

    # 2. Dedupe
    deduped, duplicates_collapsed = dedupe.dedupe_by_email(normalized)
    logger.info("after dedupe: %d leads (%d duplicates collapsed)",
                len(deduped), duplicates_collapsed)

    # 3. Enrich
    cfg = enrich.EnrichmentConfig()
    enriched = [enrich.enrich_lead(l, cfg=cfg, rng=rng) for l in deduped]

    # 4. Score
    rules = score.load_rules(rules_path)
    scored = [score.score_lead(l, rules) for l in enriched]

    # Sort hottest first for convenience — the CSV output is the artifact
    # humans actually scan.
    scored.sort(key=lambda l: l["score"], reverse=True)

    # 5. Emit
    write_clean_csv(scored, output_dir / "clean_leads.csv")
    write_clean_json(scored, output_dir / "clean_leads.json")
    salesforce.write_salesforce_csv(scored, output_dir / "salesforce_leads.csv")
    salesforce.write_salesforce_json(scored, output_dir / "salesforce_leads.json")
    salesforce.write_field_mapping(output_dir / "salesforce_field_mapping.json")

    summary = build_summary(
        total_rows=total_rows,
        dropped_invalid=dropped_invalid,
        after_dedupe=len(deduped),
        duplicates_collapsed=duplicates_collapsed,
        leads=scored,
    )
    (output_dir / "summary_report.md").write_text(summary, encoding="utf-8")

    return {
        "total_rows": total_rows,
        "dropped_invalid_email": dropped_invalid,
        "duplicates_collapsed": duplicates_collapsed,
        "final_leads": len(scored),
        "enriched_ok": sum(1 for l in scored if l.get("enrichment_status") == "ok"),
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Air GTM lead pipeline")
    parser.add_argument("--input", default="data/messy_leads.csv",
                        help="Path to input CSV (default: data/messy_leads.csv)")
    parser.add_argument("--output-dir", default="output",
                        help="Directory for output files (default: output/)")
    parser.add_argument("--rules", default="config/scoring_rules.json",
                        help="Path to scoring rules JSON")
    parser.add_argument("--seed", type=int, default=42,
                        help="RNG seed for deterministic enrichment")
    parser.add_argument("--today", default=None,
                        help="Override 'today' for relative-date parsing (YYYY-MM-DD)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    today = date.fromisoformat(args.today) if args.today else None
    stats = run(
        input_csv=Path(args.input),
        output_dir=Path(args.output_dir),
        rules_path=Path(args.rules),
        seed=args.seed,
        today=today,
    )
    print("Pipeline complete.")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print(f"Outputs written to: {args.output_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
