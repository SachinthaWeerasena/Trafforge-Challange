# StatementInsight — Solution Design Document

**Product:** AI-powered personal banking statement analyzer (Trafforge hackathon)  
**Stack:** Next.js 14 (App Router) · TypeScript · OpenAI (`gpt-4o-mini`) · Papa Parse · pdf-parse · Recharts  
**Reflects:** as-built implementation (not aspirational plan)

## 1. Architecture

```
Browser (React UI)
  │  multipart upload PDF/CSV
  ▼
POST /api/analyze  (Node runtime)
  ├─ CSV → Papa Parse → RawTransaction[]
  ├─ PDF → pdf-parse text → OpenAI JSON extract (rules fallback)
  ├─ Categorize → keyword rules, then OpenAI for "other"
  ├─ Insights → deterministic aggregates (cash-flow, spikes, recurring, bonus)
  └─ NL summary → OpenAI (deterministic fallback)

POST /api/chat
  └─ OpenAI over masked transactions (+ local intent helpers for demo Qs)
```

- **No database.** Analysis lives in React state for the session only.
- **Raw files** are read into memory for the request; response omits raw bytes. Opt-in checkbox is honored as a flag (`stored: false` always in this build).
- **AI is inside the product** (PDF extract, categorization assist, NL summary, chatbot) — not only used to write code.

## 2. Data flow

1. User uploads PDF or CSV (live during demo; sample file available for download only).
2. Server normalizes fields: `date`, `description`, `debit`, `credit`, `balance`, `reference`.
3. Rules engine assigns categories; OpenAI re-labels residual `other` when `OPENAI_API_KEY` is set.
4. Insights engine computes income/expenses/savings rate, top categories, biggest txns, recurring, spikes, monthly cash-flow, bonus alerts.
5. Summary string is generated (AI preferred).
6. UI masks account/PII patterns; chatbot answers from the in-memory transaction set.

## 3. AI models & roles

**Free-first failover** (`src/lib/ai-client.ts`): Groq → Gemini → OpenRouter → Ollama → OpenAI.

| Stage | Preferred free models | Role |
|-------|----------------------|------|
| PDF → transactions | Gemini, then Groq | Structure PDF text into transactions |
| Categorize | Groq, then Gemini | Label uncertain / all batch categories |
| NL summary | Gemini, then Groq | Plain-English spending narrative |
| Coach tips + anomaly story | Groq / Gemini | Saving tips + anomaly explanation |
| Chatbot | Groq (latency), then Gemini | Q&A grounded on statement JSON |

Keys: `GROQ_API_KEY`, `GEMINI_API_KEY` (recommended). Numeric insights remain deterministic.

## 4. Key modules

| Path | Responsibility |
|------|----------------|
| `src/lib/csv-parser.ts` | CSV ingest + header aliases |
| `src/lib/openai.ts` | All LLM calls + local chat fallbacks |
| `src/lib/categories.ts` | Keyword rules |
| `src/lib/insights.ts` | Metrics, cash-flow, bonus detectors |
| `src/lib/privacy.ts` | Masking helpers |
| `src/app/api/analyze/route.ts` | Ingest + analyze pipeline |
| `src/app/api/chat/route.ts` | Chatbot API |
| `src/components/*` | Upload, dashboard, chatbot UI |

## 5. Privacy posture (product)

- Default: no persistence of raw statements.
- UI masks long digit runs / card-like patterns in descriptions; account hint shown as `••••last4`.
- Synthetic sample data only for demo (`public/samples/`).
