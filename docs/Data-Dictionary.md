# Data Dictionary

Every extracted / derived field in StatementInsight (as built).

## Raw / extracted transaction fields

| Field | Type | Source | Transformation |
|-------|------|--------|----------------|
| `date` | `string` (ISO `YYYY-MM-DD` preferred) | CSV column aliases (`Date`, `Txn Date`, …) or PDF/AI extract | Parsed via `Date` / `DD/MM/YYYY` heuristics; invalid kept as raw string |
| `description` | `string` | CSV (`Description`, `Narration`, …) or PDF/AI | Trimmed; later masked for UI as `maskedDescription` |
| `debit` | `number \| null` | CSV debit / withdrawals / amount+type; PDF/AI | Commas/parens stripped; empty → `null` |
| `credit` | `number \| null` | CSV credit / deposits / amount+type; PDF/AI | Same as debit |
| `balance` | `number \| null` | CSV (`Balance`, …) or PDF/AI | Numeric parse; optional |
| `reference` | `string \| null` | CSV (`Reference`, `Txn Id`, …) or PDF/AI | Trimmed; empty → `null` |

### CSV header aliases (ingest)

- **date:** date, txn date, transaction date, trans date, value date, posted  
- **description:** description, narration, details, particulars, merchant, payee, memo  
- **debit:** debit, withdrawal(s), money out, out, expense, dr  
- **credit:** credit, deposit(s), money in, in, income, cr  
- **balance:** balance, running balance, available balance, bal  
- **reference:** reference, ref, ref no, transaction id, txn id, cheque  

Also supports single **Amount** + optional **Type** columns.

## Enriched transaction fields

| Field | Type | Source | Transformation |
|-------|------|--------|----------------|
| `id` | `string` | Generated | Random id per row |
| `amount` | `number` | Derived | `credit - debit` (signed; credits positive) |
| `category` | enum | Rules then optional AI | See category list below |
| `categoryConfidence` | `number` | Rules (~0.92) / AI (~0.88) / other (~0.4) | Heuristic confidence |
| `categorySource` | `"rules" \| "ai"` | Pipeline | Which step assigned category |
| `maskedDescription` | `string` | `description` | Digit runs, cards, emails, phones masked |

### Category enum

`income`, `groceries`, `utilities`, `transport`, `dining`, `subscriptions`, `loan_payments`, `fees`, `transfers`, `cash_withdrawals`, `shopping`, `travel`, `healthcare`, `entertainment`, `other`

## Analysis aggregate fields

| Field | Type | Source | Transformation |
|-------|------|--------|----------------|
| `totalIncome` | `number` | Sum of credits | Σ `credit` |
| `totalExpenses` | `number` | Sum of debits | Σ `debit` |
| `netSavings` | `number` | Derived | income − expenses |
| `savingsRate` | `number` | Derived | `(net / income) * 100` |
| `topCategories[]` | objects | Expenses grouped by category | total, count, % of expenses |
| `biggestTransactions[]` | `Transaction[]` | Expenses | Top 5 by debit |
| `recurringPayments[]` | objects | Expenses | Merchant normalize + similar amounts ≥2 |
| `unusualSpikes[]` | objects | Expenses | debit ≥ mean + 2σ |
| `cashFlow[]` | monthly objects | All txns | open/close balance, inflows, outflows, net |
| `openingBalance` / `closingBalance` | `number \| null` | First/last non-null balance | Chronological |
| `naturalLanguageSummary` | `string` | OpenAI or deterministic builder | Plain English |
| `currency` | `string` (ISO 4217) | CSV `Currency`/`CCY` column, headers like `Debit (LKR)`, symbols ($ € £ ₹ Rs), statement text codes, or AI PDF hint | Normalized via `detectCurrency()`; UI formats with `formatMoney()` |
| `analyzedAt` | ISO datetime | Server | Generation timestamp |
| `aiUsed` | `boolean` | Env | True when API key present during analyze |
| `bonus.*` | objects | Detectors | duplicates, fees, failed, salary, cash-heavy, suggestions |

## Chat API payload

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `question` | `string` | User | Required |
| `transactions` | `Transaction[]` | Client session | Masked descriptions preferred in LLM prompt |
| `history` | `{role,content}[]` | Client | Last 6 turns sent to model |
| `answer` | `string` | OpenAI or local helper | Response |
