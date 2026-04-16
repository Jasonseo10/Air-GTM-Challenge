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
- Hot: **3**
- Warm: **13**
- Cold: **73**

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
- France: 9
- United Kingdom: 9

## Industry Breakdown
- Personal / Unknown: 29
- Enterprise Software: 17
- SaaS: 13
- Financial Services: 13
- Creative Operations: 11
- (missing): 6

## Top 10 Leads by Score

| Rank | Email | Name | Company | Title | Score | Tier |
|------|-------|------|---------|-------|-------|------|
| 1 | carol.taylor@company.com | Carol Taylor | Startup.io | CEO | 80 | Hot |
| 2 | frank.anderson@company.com | Frank Anderson | Air Inc | CTO | 75 | Hot |
| 3 | david.taylor@air.inc | David Taylor | Air Inc | VP Marketing | 75 | Hot |
| 4 | jack.chen@company.com | Jack Chen | Company | VP Marketing | 70 | Warm |
| 5 | henry.brown@company.com | Henry Brown | Initech | CEO | 70 | Warm |
| 6 | jack.lee@company.com | Jack Lee | Air Inc | CEO | 70 | Warm |
| 7 | alice.lee@air.inc | Alice Lee | GlobalTech | VP Marketing | 70 | Warm |
| 8 | valid@example.com | Carol | Example Corp | VP Marketing | 65 | Warm |
| 9 | jack.jones@business.co | Jack Jones | Initech | VP Marketing | 65 | Warm |
| 10 | jack.martinez@company.com | Jack Martinez | Initech | CTO | 63 | Warm |
