# Lead Pipeline Summary Report

## Volume
- Rows read from source: **100**
- Dropped (invalid/missing email): **5**
- Duplicate rows collapsed: **6**
- Unique leads after dedupe: **89**
- Final leads in output: **89**

## Enrichment
- Successfully enriched: **83 / 89 (93.3%)**
- Failed (after retry): **6**

## Scoring
- Average score: **31.7**
- Hot: **0**
- Warm: **8**
- Cold: **0**

## Data Quality Issues (count of leads flagged)
- `missing_or_invalid_phone`: 48
- `missing_company`: 18
- `missing_or_unknown_country`: 13
- `company_backfilled_from_enrichment`: 7
- `enrichment_failed`: 6
- `missing_title`: 3
- `missing_or_invalid_created_at`: 2

## Source Breakdown
- Website Visitor: 25
- Referral: 23
- Product Signup: 16
- Event: 13
- LinkedIn: 12

## Country Breakdown
- United States: 22
- Canada: 19
- Germany: 11
- India: 10
- (missing): 9
- United Kingdom: 9
- France: 9

## Industry Breakdown
- Personal / Unknown: 29
- Enterprise Software: 17
- Financial Services: 13
- SaaS: 13
- Creative Operations: 11
- (missing): 6

## Top 10 Leads by Score

| Rank | Email | Name | Company | Title | Score | Tier |
|------|-------|------|---------|-------|-------|------|
| 1 | bob.lee@business.co | Bob Lee | GlobalTech | Head of Sales | 63 | Warm |
| 2 | david.taylor@air.inc | David Taylor | Air Inc | VP Marketing | 62 | Warm |
| 3 | alice.lee@air.inc | Alice Lee | GlobalTech | VP Marketing | 62 | Warm |
| 4 | carol.taylor@company.com | Carol Taylor | Startup.io | CEO | 59 | Warm |
| 5 | ivy.anderson@startup.io | Ivy Anderson | Initech | Data Analyst | 56 | Warm |
| 6 | alice.chen@air.inc | Alice Chen | Acme Co | Senior Engineer | 56 | Warm |
| 7 | ivy.jones@company.com | Ivy Jones | Startup.io | Product Lead | 56 | Warm |
| 8 | david.lee@gmail.com | David Lee | Air Inc | CEO | 56 | Warm |
| 9 | henry.smith@business.co | Henry Smith | Example Corp | Senior Engineer | 52 | Cool |
| 10 | grace.martinez@gmail.com | Grace Martinez | Example Corp | Head of Sales | 50 | Cool |
