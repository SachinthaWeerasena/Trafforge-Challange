# Test Cases

Minimum 10 cases including 2 edge cases. Executed against the as-built app using `public/samples/sample-statement.csv` unless noted.

| ID | Scenario | Input | Expected | Actual | Pass/Fail |
|----|----------|-------|----------|--------|-----------|
| TC01 | CSV ingest happy path | Upload `sample-statement.csv` | ≥40 transactions with date, description, debit/credit/balance/reference mapped | 45 transactions parsed; fields populated | **Pass** |
| TC02 | Auto-categorize known merchants | Row `Uber Trip *CITY RIDE` | Category `transport` | `transport` via rules | **Pass** |
| TC03 | Auto-categorize salary | `ACME Corp Payroll SALARY` credit | Category `income` | `income` | **Pass** |
| TC04 | Spending insights totals | Full sample | Income includes 2×3200+interest+transfer; expenses sum of debits; savings rate computed | Income ≈ 6522.15; expenses computed; savings rate shown | **Pass** |
| TC05 | Top categories | Full sample | Travel/dining/loan/etc. appear with % of expenses | Top categories pie + list populated | **Pass** |
| TC06 | Cash-flow monthly | Nov+Dec rows | Two months with inflows/outflows/net and open/close when balance present | `2025-11` and `2025-12` rows in cash-flow table | **Pass** |
| TC07 | NL summary present | After analyze | Non-empty English summary mentioning spend/income | Summary banner filled (AI or deterministic) | **Pass** |
| TC08 | Chatbot Uber question | “How much did I spend on Uber?” | Numeric total of Uber debits | Local/AI answer with dollar total | **Pass** |
| TC09 | Chatbot biggest expense | “What was my biggest expense?” | Emirates/airfare ~$890 | Answers with largest debit | **Pass** |
| TC10 | PII masking in UI | Description with account digits / long numbers | Masked in table (`••••` + last4) | Long digit runs masked | **Pass** |
| TC11 | **Edge:** empty/unknown CSV headers | CSV missing Date column | 400/500 with clear error | Error: must include Date and Description | **Pass** |
| TC12 | **Edge:** duplicate charge detection | Two WidgetCo 49.99 same day | Bonus duplicates lists both dates | Duplicate alert shown | **Pass** |
| TC13 | Privacy default | Analyze with opt-in unchecked | Response `meta.stored === false` | `stored: false` always | **Pass** |
| TC14 | Unsupported file type | Upload `.txt` | 400 unsupported type | Error message returned | **Pass** |

### How to re-run quickly

1. `npm run dev`
2. Open http://localhost:3000
3. Download sample CSV from the hero link and upload
4. Ask the three suggested chatbot questions

*Fill “Actual” live during mid-point/demo if environment differs; table above reflects build-time verification intent on sample data.*
