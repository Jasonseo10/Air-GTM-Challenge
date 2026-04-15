# Air GTM Engineering Challenge — Lead Pipeline

A small Python pipeline that ingests the messy `leads.csv`, cleans it,
enriches each lead via a mocked enrichment API, scores leads against a
configurable ruleset, and emits Salesforce-ready outputs plus a summary
report.

## TL;DR

```bash
python run_pipeline.py
```

No dependencies outside the Python 3.9+ standard library. Input lives at
`data/messy_leads.csv`; outputs land in `output/`.

## Repository layout

```
Air GTM Challenge/
├── run_pipeline.py              # thin entrypoint
├── src/
│   ├── pipeline.py              # orchestration: ingest -> normalize -> dedupe -> enrich -> score -> emit
│   ├── normalize.py             # per-field normalizers (names, emails, phones, dates, etc.)
│   ├── dedupe.py                # email-based dedupe with most-complete merge
│   ├── enrich.py                # mocked enrichment API w/ retry + exponential backoff
│   ├── score.py                 # config-driven scoring engine
│   └── salesforce.py            # SF Lead object field mapping + bulk CSV/REST JSON emitters
├── config/
│   └── scoring_rules.json       # scoring rules (edit to tune — no code changes needed)
├── data/
│   └── messy_leads.csv          # input
├── output/                      # generated
│   ├── clean_leads.csv          # human-readable cleaned leads
│   ├── clean_leads.json         # full structured output w/ score breakdown
│   ├── salesforce_leads.csv     # Salesforce bulk-API-ready CSV
│   ├── salesforce_leads.json    # Salesforce REST composite payload
│   ├── salesforce_field_mapping.json  # internal -> SF field name map
│   └── summary_report.md        # counts, tiers, data-quality histogram, top 10
└── tests/
    └── test_normalize.py        # 29 unit tests covering the trickiest normalizers
```

## How to run

```bash
# Run the full pipeline with defaults
python run_pipeline.py

# Custom paths / options
python run_pipeline.py \
    --input data/messy_leads.csv \
    --output-dir output \
    --rules config/scoring_rules.json \
    --seed 42 \
    --today 2026-04-15           # pins 'today' for deterministic relative-date parsing
```

```bash
# Run the unit tests
python -m unittest discover tests
```

## Pipeline stages

1. **Ingest + normalize** (`src/normalize.py`, `src/pipeline.py::ingest`)
   Each field gets its own normalizer. Per-row data quality issues are
   collected in a `data_quality_issues` list so downstream (and GTM) can
   see exactly why a lead is flagged.

2. **Drop invalid rows.** The only hard-drop rule is **missing/malformed
   email** — without email we can't dedupe, enrich, or load into Salesforce.
   Every other missing field becomes a flag, not a drop.

3. **Dedupe** (`src/dedupe.py`) by normalized email. When the same email
   appears on multiple rows, fields are merged preferring the longest
   non-empty value per column (a simple most-complete heuristic). The merge
   count is preserved on the output row for auditability.

4. **Enrich** (`src/enrich.py`) via a mocked API. The mock:
   - Simulates network latency.
   - Fails ~10% of the time (deterministic by `hash(email) + attempt`).
   - Retries up to 3 times with exponential backoff (50ms → 100ms → 200ms).
   - Returns `company_size_band`, `company_size_min`, `industry`,
     `estimated_revenue` — plus derives `seniority_level` from the title.
   - On persistent failure, the lead still flows through (tagged
     `enrichment_status: failed`) — we never drop leads at this stage.

5. **Score** (`src/score.py`) using rules from `config/scoring_rules.json`.
   Every match produces an audit entry in `score_breakdown` so GTM can
   explain any score.

6. **Emit** six files — see repo layout above.

## Assumptions (called out explicitly)

| Assumption | Rationale |
|---|---|
| **`CA` = Canada**, not California | Column is labeled "Country". `Canada` and `CA` never co-occur on the same lead. Documented in `normalize.py`. |
| **`MM/DD/YYYY` is US format**, not European | US-centric dataset (most countries are US/Canada, source is an Air GTM team). Ambiguous dates like `05/07/2025` are parsed as May 7. |
| **7-digit phones like `5551212` are unusable** | Can't dial without area code; safer to flag than invent one. |
| **Personal-email domains (gmail/yahoo) get a −10 score penalty** | Personal emails are a weak buying signal. Configurable in the rules JSON. |
| **Duplicates merge; they don't split** | Two rows with the same email are treated as the same lead. Different emails are always distinct leads even if names match. |
| **Salesforce requires `LastName` and `Company`** | Missing `LastName` falls back to `FirstName` or email local-part. Missing `Company` falls back to the string `"Unknown"` so the record can load and RevOps can correct it later. |
| **"Head of Sales" is a Director-level role** | Mapped via `derive_seniority` heuristic in `enrich.py`. |
| **`"COMPANY"` in the raw data is treated as a real (if odd) company name** | I don't have context to say it's a placeholder. Normalized to `"Company"`. Can be re-tagged if incorrect. |

## Scoring — how to tune it

`config/scoring_rules.json` is authoritative. Each rule specifies a
`field`, an `op`, a `value`, and a `points` delta. Supported ops:
`equals`, `not_equals`, `contains`, `contains_any`, `in`, `not_in`,
`gte`, `gt`, `lte`, `lt`, `between`, `is_present`, `is_absent`.

Two derived fields are available in addition to lead fields:
- `email_domain` — for personal-email penalties
- `data_quality_issue_count` — for penalizing incomplete records

Tiers (Hot / Warm / Cold thresholds) are also in the JSON. No code
changes are needed to re-tune; re-run the pipeline and the breakdown
shows up per-lead.

## Sample output (from `summary_report.md`)

```
Volume:       100 rows in -> 5 dropped (bad email) -> 6 dupes collapsed -> 89 leads out
Enrichment:   83 / 89 enriched successfully (93.3%)
Scoring:      13 Hot, 37 Warm, 39 Cold (avg 31.7)
Top issues:   missing_or_invalid_phone: 48, missing_company: 18, ...
```

## Trade-offs I made

- **Stdlib only** (no pandas). This dataset is small enough that CSV +
  regex is clearer and has zero install friction. Pandas would be the
  right call at ~100k rows.
- **Regex email validation**, not RFC 5322. The messy inputs we need to
  reject (missing `@`, missing TLD) are easy; full RFC compliance is
  famously hard and not worth it here.
- **Most-complete merge on dedupe** — simple and predictable. For a
  production system I'd want a rules-based merge (e.g., prefer the
  most-recent `updated_at`, prefer enrichment-backed values for
  enrichable fields).
- **Deterministic mock enrichment.** Same input → same output every run.
  Makes the output diffable across code changes and makes retries
  actually meaningful (failures are deterministic-per-attempt, not
  random-per-attempt).
- **Score breakdown in JSON, comma-joined in CSV.** Auditability for
  humans in the JSON; simpler CSV for bulk loads.

## How I'd scale / productionize this

1. **Orchestration.** Wrap `pipeline.run()` as a Prefect/Airflow job
   triggered by new rows in the source system. Each stage (ingest,
   normalize, dedupe, enrich, score, emit) becomes a task so partial
   failures are retry-able independently.

2. **Real enrichment.** Swap `_call_mock_api` for a Clearbit/ZoomInfo
   client. The response shape is already the target shape, so this is a
   one-function change. Add:
   - **Per-provider rate limiting** (token bucket).
   - **Response caching** keyed by email domain with a TTL (company
     enrichment doesn't change daily).
   - **Secondary provider fallback** so enrichment doesn't go dark when
     one vendor has an outage.

3. **State + idempotency.** Persist leads to Postgres keyed by email.
   The pipeline becomes an UPSERT rather than a full re-run. Only
   re-enrich leads whose enrichment is stale (e.g., > 90 days).

4. **Salesforce ingestion.** Use the SF Bulk API 2.0 with the
   `salesforce_leads.csv` output. For streaming/low-latency, switch to
   the Composite REST API with the `salesforce_leads.json` payload.
   Wire up duplicate rules in SF (not just our email dedupe) and the
   Lead Assignment Rules so leads route to the right AE.

5. **Observability.** Structured logs (already JSON-friendly), plus
   metrics for: ingest throughput, drop rate by reason, enrichment
   success rate per provider, score distribution, SF ingestion
   success/failure. Alert on drop rate > N% (signals an upstream
   schema change).

6. **Configuration management.** Keep `scoring_rules.json` in the repo
   but ship it to a config store (e.g., LaunchDarkly JSON flag or S3)
   so non-engineers can tune scoring without a deploy. Add a
   `score_version` to each output row so downstream analytics can
   compare cohorts scored under different rules.

7. **Testing.** Current tests cover normalizers. For production I'd
   add: golden-file tests on the pipeline output, contract tests on
   the enrichment client, and property tests (hypothesis) on
   normalizers.

8. **Data quality gates.** If > X% of rows fail enrichment or > Y% of
   a critical field is missing in a given run, fail the pipeline
   (or move to a quarantine output) rather than silently shipping
   degraded data to Salesforce.

## What's in the box — deliverables checklist

- [x] Python code that runs locally with zero deps (`run_pipeline.py`)
- [x] Normalized names, emails, titles, phones, countries, dates, companies
- [x] Mocked enrichment API (request + response both mocked) adding 4 new fields
- [x] Config-driven lead scoring with audit trail per lead
- [x] Clean CSV + JSON output ready for Salesforce ingestion
- [x] Summary report (Markdown) with counts, quality histogram, top 10
- [x] Deduplication by email with most-complete merge
- [x] Retry + exponential backoff on enrichment failures
- [x] Salesforce bulk-API CSV + REST composite JSON + field mapping
- [x] Assumptions and productionization notes (this README)
- [x] 29 unit tests covering the trickiest normalizers
