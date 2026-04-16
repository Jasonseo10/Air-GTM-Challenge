# Lead Pipeline Summary Report

## Volume
- Rows read from source: **100**
- Dropped (invalid/missing email): **5**
- Duplicate rows collapsed: **5**
- Unique leads after dedupe: **90**
- Final leads in output: **90**

## Enrichment
- Successfully enriched: **58 / 90 (64.4%)**
- No match (personal / unknown domain): **16**
- Failed after retry: **16**

## Scoring
- Average score: **38.6**
- Hot: **2**
- Warm: **13**
- Cool: **35**
- Low: **40**

## Data Quality Issues (count of leads flagged)
- `missing_or_invalid_phone`: 48
- `missing_company`: 18
- `enrichment_no_match`: 16
- `enrichment_failed`: 16
- `missing_or_unknown_country`: 13
- `company_backfilled_from_enrichment`: 9
- `missing_title`: 3
- `missing_or_invalid_created_at`: 2

## Source Breakdown
- Website Visitor: 25
- Referral: 24
- Product Signup: 16
- Event: 13
- LinkedIn: 12

## Country Breakdown
- United States: 22
- Canada: 19
- Germany: 11
- India: 10
- (missing): 10
- United Kingdom: 9
- France: 9

## Industry Breakdown
- (missing): 32
- Enterprise Software: 19
- Financial Services: 14
- SaaS: 14
- Creative Operations: 11

## Top 10 Leads by Score

| Rank | Email | Name | Company | Title | Score | Tier |
|------|-------|------|---------|-------|-------|------|
| 1 | bob.lee@business.co | Bob Lee | GlobalTech | Head of Sales | 76 | Hot |
| 2 | ivy.jones@company.com | Ivy Jones | Startup.io | Product Lead | 76 | Hot |
| 3 | david.taylor@air.inc | David Taylor | Air Inc | VP Marketing | 73 | Warm |
| 4 | alice.lee@air.inc | Alice Lee | GlobalTech | VP Marketing | 73 | Warm |
| 5 | henry.smith@business.co | Henry Smith | Example Corp | Senior Engineer | 73 | Warm |
| 6 | carol.taylor@company.com | Carol Taylor | Startup.io | CEO | 71 | Warm |
| 7 | david.lee@gmail.com | David Lee | Air Inc | CEO | 67 | Warm |
| 8 | ivy.anderson@startup.io | Ivy Anderson | Initech | Data Analyst | 65 | Warm |
| 9 | valid@example.com | Carol | Example Corp | VP Marketing | 62 | Warm |
| 10 | alice.chen@air.inc | Alice Chen | Acme Co | Senior Engineer | 62 | Warm |
