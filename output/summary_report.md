# Lead Pipeline Summary Report

## Volume
- Rows read from source: **100**
- Dropped (invalid/missing email): **5**
- Duplicate rows collapsed: **2**
- Unique leads after dedupe: **93**
- Final leads in output: **93**

## Enrichment
- Successfully enriched: **87 / 93 (93.5%)**
- Failed (after retry): **6**

## Scoring
- Average score: **31.4**
- Hot: **13**
- Warm: **38**
- Cold: **42**

## Data Quality Issues (count of leads flagged)
- `missing_or_invalid_phone`: 49
- `missing_company`: 18
- `missing_or_unknown_country`: 13
- `company_backfilled_from_enrichment`: 9
- `enrichment_failed`: 6
- `missing_title`: 3
- `missing_or_invalid_created_at`: 2

## Source Breakdown
- Website Visitor: 26
- Referral: 24
- Product Signup: 16
- Event: 14
- LinkedIn: 13

## Country Breakdown
- United States: 23
- Canada: 19
- (missing): 12
- Germany: 11
- India: 10
- France: 9
- United Kingdom: 9

## Industry Breakdown
- Personal / Unknown: 29
- Enterprise Software: 18
- SaaS: 16
- Financial Services: 13
- Creative Operations: 11
- (missing): 6

## Top 10 Leads by Score

| Rank | Email | Name | Company | Title | Score | Tier |
|------|-------|------|---------|-------|-------|------|
| 1 | carol.taylor@company.com | Carol Taylor | Startup.io | CEO | 80 | Hot |
| 2 | frank.anderson@company.com | Frank Anderson | Air Inc | CTO | 75 | Hot |
| 3 | david.taylor@air.inc | David Taylor | Air Inc | VP Marketing | 75 | Hot |
| 4 | jack.chen@company.com | Jack Chen | Company | VP Marketing | 70 | Hot |
| 5 | henry.brown@company.com | Henry Brown | Initech | CEO | 70 | Hot |
| 6 | jack.lee@company.com | Jack Lee | Air Inc | CEO | 70 | Hot |
| 7 | alice.lee@air.inc | Alice Lee | GlobalTech | VP Marketing | 70 | Hot |
| 8 | valid@example.com | Carol | Example Corp | VP Marketing | 65 | Hot |
| 9 | jack.jones@business.co | Jack Jones | Initech | VP Marketing | 65 | Hot |
| 10 | jack.martinez@company.com | Jack Martinez | Initech | CTO | 63 | Hot |
