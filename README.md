# Air GTM Engineering Challenge — Lead Pipeline

A Python pipeline that ingests messy CSV lead data, normalizes it, enriches it
through a **three-layer waterfall** (firmographic → technographic → product
telemetry), scores leads with a **category-aware, context-conditional** rule
engine, and emits Salesforce-ready outputs — paired with an interactive
Next.js dashboard for real-time ICP scoring, human-in-the-loop review, and
export.

## TL;DR

```bash
# 1. Run the core pipeline (zero dependencies, stdlib only)
py run_pipeline.py

# 2. Start the interactive dashboard
cd frontend
npm install
npm run dev
# open http://localhost:3000
```

## Repository layout

```
Air GTM Challenge/
├── run_pipeline.py              # pipeline entrypoint (standalone, stdlib-only)
├── src/
│   ├── pipeline.py              # orchestration
│   ├── normalize.py             # per-field normalizers
│   ├── dedupe.py                # email dedupe with most-complete merge
│   ├── enrich.py                # 3-layer waterfall (FirmoGraph → StackLens → Product DB)
│   ├── score.py                 # config-driven scoring with `when` clauses + categories
│   └── salesforce.py            # SF Lead field mapping + bulk CSV/REST JSON emitters
├── config/
│   └── scoring_rules.json       # categorized, conditional scoring rules
├── data/
│   └── messy_leads.csv          # default input
├── output/                      # generated
├── tests/
│   └── test_normalize.py        # 29 unit tests
├── frontend/                    # Next.js interactive dashboard
│   ├── app/
│   │   ├── components/
│   │   ├── page.js              # upload → review → results → detail → export
│   │   ├── layout.js
│   │   ├── globals.css
│   │   └── api/pipeline/        # API routes that invoke the Python pipeline
│   └── package.json
└── .gitignore
```

## How to run

### Core pipeline (no dependencies)

```bash
py run_pipeline.py

# Custom paths / options
py run_pipeline.py \
    --input data/messy_leads.csv \
    --output-dir output \
    --rules config/scoring_rules.json \
    --seed 42 \
    --today 2026-04-15

# Unit tests
py -m unittest discover tests
```

### Interactive dashboard (Next.js)

```bash
cd frontend
npm install
npm run dev      # http://localhost:3000
```

**Dashboard features:**

- **CSV upload** — drag-and-drop, or use the default `messy_leads.csv`
- **Human-in-the-loop review** — approve duplicate merges and restore dropped records before enrichment
- **10 ICP scoring sliders** — weights mirror the Python pipeline's rule categories; scoring recalculates live
- **Summary report** — interactive Markdown modal, downloadable
- **Score rings** — tier-coded SVG indicators
- **Filterable/sortable results** — by tier (Hot/Warm/Cool/Low), search by name/email/company
- **Lead detail panel** — enrichment provenance (which provider fired), product-usage signals, ICP breakdown with category grouping, data-quality issues
- **Export** — toggle Salesforce CSV / REST JSON, preview, download

The dashboard calls the Python pipeline through Next.js API routes
(`child_process.spawn`). Server-side pipeline = canonical artifacts.
Client-side ICP scoring = instant slider response.

## Pipeline stages

1. **Ingest + normalize** (`src/normalize.py`, `src/pipeline.py`) — per-field
   normalizers with a `data_quality_issues` list attached to each row. We
   *flag*, not drop, so a reviewer can see what was salvageable.

2. **Drop invalid rows** — the **only** hard-drop rule is missing or
   malformed email. Everything else is recoverable either manually or via
   enrichment backfill.

3. **Dedupe** (`src/dedupe.py`) by normalized email with most-complete merge.
   Different emails = different leads even if the names match; same person
   often has multiple addresses and we'd rather surface a duplicate candidate
   than silently collapse two real leads.

4. **Enrich** (`src/enrich.py`) — three-layer waterfall (see below).

5. **Score** (`src/score.py`) — category-aware, conditional rules loaded from
   `config/scoring_rules.json`. Every match is logged in `score_breakdown`
   so GTM can explain any number.

6. **Emit** — Salesforce Bulk API CSV, REST composite JSON, field mapping
   reference, human-scannable CSV/JSON, and a Markdown summary report.

## Enrichment — why three layers

No real GTM stack relies on one provider. Clearbit misses companies ZoomInfo
catches; BuiltWith adds technographic context neither firmographic provider
has; and neither of them can tell you what the prospect has actually done
inside your own product. Clay/Apollo/etc. all implement this as a waterfall.
So does this pipeline.

| Layer | Module | Fills | Typical coverage |
|---|---|---|---|
| 1. FirmoGraph | `FirmoGraphProvider` | `company_size_band`, `company_size_min`, `industry`, `estimated_revenue`, `hq_country`, `company_name` (backfill) | ~70% |
| 2. StackLens | `StackLensProvider` | `detected_tools`, `has_creative_stack`, `has_martech_stack`, `tech_modernity_score` | ~55% (of firmographic-known) |
| 3. Product telemetry | `_synthesize_product_signals` | `pricing_page_views`, `has_signup_intent`, `credit_usage_pct`, `asset_uploads`, `teammate_invites`, `active_channels`, `creative_job_postings`, `has_marketing_title`, `activation_score` | 100% (our own data) |

Each layer only fills keys the prior layer left empty — the waterfall
merge is in `_merge_missing`. Provenance is recorded per-lead
(`enrichment_providers_ok`, `enrichment_provider_errors`) so we can audit
coverage rates and a dashboard reviewer can see *which* provider actually
fired for a given company.

**Why StackLens matters more than a generic "industry" label.** "Marketing
Technology" is noisy — half those companies have real creative teams, half
don't. "Uses Figma and Adobe Creative Cloud" is categorical evidence. The
`tech_modernity_score` feeds a dedicated expansion rule — companies with a
modern stack have the operational maturity to actually deploy another tool,
so implementation risk is lower and time-to-value is faster.

**Determinism.** Every layer is hashed on a stable key so the same input
always produces the same output. Failures are hash-driven but modulated by
attempt number so retries can actually succeed — otherwise retry logic is
theatre.

## Scoring philosophy — intent-first for a PLG-adjacent product

Traditional outbound scoring is firmographic-first: size, industry, title,
then everything else. That framing is wrong for Air. Air is a creative-ops
tool with a self-serve surface — prospects validate themselves **by using
the product** before a seller ever calls them. What they've *done* matters
more than what their org chart says.

So the engine splits rules into four categories and weights them accordingly:

| Category | What it measures | Max contribution |
|---|---|---|
| **intent** | Product usage and behavioral signals | ~65% of max score |
| **fit** | Firmographic match (size, industry, stack) | ~25% |
| **persona** | Title, seniority, buyer profile | ~15% |
| **expansion** | Whitespace + growth signals (contrarian) | ~15% |

Rules can belong to any category, and the breakdown reports per-category
points so a seller can see *why* a lead scored high, not just that it did.
A lead scoring 80 via intent is a different conversation than one scoring
80 via firmographic fit — both deserve outreach, but the opening line is
not the same.

### Context-conditional rules — where `when` clauses earn their keep

A flat rule like "+10 points for CEO" double-counts. A CEO at Google is a
different person than a CEO at a 20-person startup, and at enterprise scale
the real buyer is a functional leader, not the CEO. So several rules use a
`when` clause that gates the main rule on another condition:

| Rule | Trigger | Why the gate exists |
|---|---|---|
| `persona_founder_led` | C-Level **AND** company_size < 50 | At seed/early-stage, the CEO is the buyer AND the user. Above 50 employees buying specializes — a CEO boost starts double-counting with functional-leader rules. |
| `intent_signup_validated` | credit_usage ≥ 50% **AND** source == Product Signup | A signup alone is cheap signal; a signup backed by real usage is categorically stronger and deserves points on top of the base signup rule. |
| `intent_referral_warm` | Referral **AND** business email (not gmail) | A referral from a personal email is unverifiable; a referral from a corporate address is a pre-vetted warm intro. |
| `expansion_activated_enterprise` | size ≥ 1000 **AND** uploads ≥ 200 **AND** teammates ≥ 5 | Large account that is *also* activated — rare, extremely high-confidence, stacks intentionally on top of `fit_enterprise` because size + usage is a qualitatively different signal. |
| `expansion_channel_whitespace` | size ≥ 1000 **AND** active_channels ≤ 2 | Contrarian. A large company with a narrow channel footprint is under-invested, not under-ambitious. Rewards *unrealized* potential, not existing activity. |
| `fit_smb_creative` | Industry in {Creative Ops, Media, E-commerce, MarTech} **AND** 50 ≤ size ≤ 200 | Tight fit only — same industry at enterprise scale is better covered by `fit_enterprise`. |

This is what category + conditional rules give you that a flat rules table
cannot: scoring that is **context-aware** without exploding into dozens of
one-off tweaks. Every gated rule encodes a specific belief about the sales
motion.

### Why intent signals outweigh firmographic fit

- **`intent_signup_product`** = 15 points. The single largest weight. A
  prospect giving us their email in exchange for a workspace has self-
  qualified further than any form-fill can measure.
- **`intent_credit_usage_high`** (80%+) = 10 points. Near-exhaustion of free
  credits is the classic PQL signal — a prospect about to hit a wall will
  convert this week or never.
- **`intent_team_adoption`** (10+ teammates) = 8 points. Viral/expansion
  signal. The primary user has *already* sold the product internally — we
  are closing a contract, not making a pitch.
- **`fit_enterprise`** (1000+ employees) = 7 points. Large account, long
  cycle, high ACV. Necessary but not sufficient — an enterprise lead with
  zero usage is a cold call, and the score reflects that.

### Tier thresholds and sales motion

| Tier | Threshold | Sales motion |
|---|---|---|
| Hot | ≥ 75 | Same-day personalized outreach |
| Warm | ≥ 55 | Nurture sequence + personalized follow-up |
| Cool | ≥ 35 | Drip, newsletter, retarget |
| Low | < 35 | Deprioritize — recheck in 90 days |

The dashboard and the Python pipeline use the **same** thresholds so a lead's
tier in the file output never disagrees with its tier in the UI.

## Assumptions — and why

| Assumption | Reasoning |
|---|---|
| **`CA` = Canada**, not California | Column is labeled "Country" — a state code there would be a normalization bug, not a value. |
| **`MM/DD/YYYY` is US format** | Dataset is US-weighted; disambiguating per-row from context (e.g. day > 12) would be cute but unreliable. |
| **7-digit phones are unusable** | Without area code you can't dial — better to flag as missing than store something a rep will skip. |
| **Duplicates merge by email, not name** | Two "John Smith"s at different companies are different leads; one person with two addresses is still one person we should reach out to once. Email is the only field rigid enough to be a dedupe key. |
| **Email is the ONLY hard-drop field** | Salesforce can accept a lead with no phone, no title, and a fallback company. Without an email we can't dedupe, enrich, or deliver messages — so it's the one line we can't cross. |
| **Personal email domains return no firmographic match** | Clearbit/ZoomInfo 404 on `gmail.com` in production — we simulate the same behavior rather than synthesizing a fake company. Reported as `no_match`, not `failed`, because it's expected behavior, not a pipeline health issue. |
| **Referral > Product Signup on *close rate***, not raw score | We actually weight Product Signup (15 pts) higher than Referral (10 pts). Rationale: with mocked data, signups are a behavioral trigger we can verify; a referral is a source flag we can't. In production with a real referrer graph, this ordering flips and would be reflected in a rule change — the rule file is designed for that kind of tuning. |
| **"COMPANY" (all caps) is placeholder data**, not a company name | Seen in the sample data; treated as missing and eligible for enrichment backfill. |
| **Mocked enrichment is deterministic by hash** | Seeded behavior means the pipeline produces identical output on every run — critical for reproducibility in testing and for the dashboard's review step, where a reviewer re-running a file should see the same merges flagged. |
| **The `activation_score` is a composite, not a direct signal** | Real activation scores come from the application DB. We synthesize it from credit usage + asset uploads + teammate invites so the rule layer can reason about "large AND activated" without hard-coding the composite into the rule. |

## Trade-offs — with the why

- **Stdlib only for the pipeline.** The dataset is 100 rows. Pulling in
  pandas for this would add install friction without measurable benefit.
  The normalization code is straightforward enough that it's more readable
  as plain dicts and list comprehensions than as DataFrame ops.
- **Client-side ICP scoring in the dashboard.** Sliders feel instant because
  they are instant — no API round-trip. The Python pipeline still produces
  its own canonical scores for the file outputs, and the two scorers share
  the same thresholds and the same conceptual categories so they never
  disagree on a tier.
- **Product-usage signals are mocked.** Not a shortcut — a design decision.
  The synthesis function is isolated (`_synthesize_product_signals`) and
  takes a lead dict in, returns a signals dict out. Swapping it for a
  Segment/Amplitude query is a one-function change, not a pipeline rewrite.
- **Single-file React component for the dashboard.** 1600 lines in one file
  is unusual, but for a demo surface this size it keeps the data flow
  obvious — state lives in one place, the stages are procedural. When the
  UI grows, it splits along state boundaries (upload / review / results
  are already natural seams).
- **Four categories, not two.** A traditional "account fit vs contact fit"
  framing is valid for enterprise SDR work. For Air it's incomplete —
  there's an `intent` axis (product usage) and an `expansion` axis
  (whitespace) that matter more than either of those two for a PLG-adjacent
  product. Collapsing either into "account fit" loses information a seller
  needs.
- **Waterfall merges by filling missing, not by overwriting.** FirmoGraph
  runs first and gets trusted. StackLens only fills what FirmoGraph left
  empty. In production the priority order would be tunable per-field
  (e.g., "prefer ZoomInfo for revenue, prefer Clearbit for industry"), and
  the merge function already takes a per-key predicate — that's the
  extensibility hook.

## How I'd scale / productionize

1. **Orchestration.** Wrap `pipeline.run()` as a Prefect/Airflow/Dagster
   task. Schedule daily for incoming leads; webhook-trigger for
   form-submits where latency matters.
2. **Real enrichment.** Replace `FirmoGraphProvider.fetch` and
   `StackLensProvider.fetch` with live Clearbit/ZoomInfo/BuiltWith clients.
   The waterfall merge logic stays — this is the pattern Clay and Apollo
   already implement.
3. **Internal product data.** Swap `_synthesize_product_signals` for a
   Segment/Amplitude query or a direct join against the product DB. The
   rule layer never needs to know the difference.
4. **State + idempotency.** Persist to Postgres with UPSERT on email.
   Pipeline becomes incremental rather than batch-rewrite.
5. **Salesforce sync.** Post the generated JSON to SF Bulk API 2.0. The
   field mapping is already emitted alongside the data.
6. **Observability.** Structured logs + metrics for drop rate, enrichment
   success rate per provider, score distribution, and tier migration over
   time — a lead moving from Cool to Hot is a stronger signal than its raw
   score on any given day.
7. **Validation at the SF boundary.** A standalone validator module that
   checks UTF-8, field lengths, ISO dates, boolean representations, and
   sObject `attributes` metadata before hitting the CRM — fail loudly at
   our boundary so we never surface a malformed record to the user.
8. **LLM-assisted normalization** for the long tail of title/company
   edge cases. Expand `VP Mktg → VP Marketing` is easy; inferring that
   "Hd of Brand & Demand Gen" is senior marketing without a lookup table
   is where a small LLM call earns its keep.

## Deliverables

- [x] Python pipeline — zero deps, stdlib only
- [x] Field normalization (names, emails, titles, phones, countries, dates)
- [x] **Three-layer waterfall enrichment** (firmographic → technographic → product telemetry)
- [x] **Category-aware scoring** (intent / fit / persona / expansion)
- [x] **Context-conditional rules** via `when` clauses (founder-led, activated-enterprise, channel-whitespace, validated-signup, warm-referral)
- [x] Config-driven scoring with audit trail + per-category breakdown
- [x] Salesforce-ready CSV + JSON outputs + field mapping
- [x] Deduplication by email with most-complete merge
- [x] Retry + exponential backoff per provider with independent failure keys
- [x] 29 unit tests
- [x] Interactive Next.js dashboard with drag-and-drop upload
- [x] Human-in-the-loop review UI (approve merges, restore drops)
- [x] Real-time ICP weight sliders with live rescoring
- [x] Auto-generated summary report (Markdown popup & download)
- [x] Export with CSV/JSON toggle
