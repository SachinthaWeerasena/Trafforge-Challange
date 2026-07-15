# StatementInsight

AI-powered personal banking statement analyzer — Trafforge internal hackathon.

## Features

- **Ingest** PDF & CSV (date, description, debit, credit, balance, reference)
- **Auto-categorize** via keyword rules + OpenAI for unknowns
- **Insights** income / expenses / savings rate, top categories, biggest txns, recurring, spikes
- **Cash-flow** monthly opening/closing, inflows/outflows, net
- **Natural-language summary** (OpenAI + deterministic fallback)
- **Chatbot** grounded on the uploaded statement
- **Bonus:** duplicate charges, fees, failed txns, salary consistency, cash-heavy alert, saving tips
- **Privacy:** session-only processing, masked account/PII in UI, synthetic samples only

## Quick start

```bash
npm install
cp .env.example .env.local
# Add at least one FREE key (recommended):
#   GROQ_API_KEY=...     https://console.groq.com/keys
#   GEMINI_API_KEY=...   https://aistudio.google.com/apikey
npm run dev
```

**Free AI used in-product for:** PDF extract · categorize · NL summary · coach tips · anomaly insight · chatbot (auto-failover Groq → Gemini → OpenRouter → Ollama → OpenAI).

## Documentation (submission)

See `/docs`:

1. Solution Design Document  
2. AI Usage Log  
3. Data Dictionary  
4. Test Cases  
5. Privacy & Security Notes  

## Live demo script (judging)

1. Upload `public/samples/sample-statement.csv` (or PDF sample) live — no preloaded analysis.  
2. Show categories, insights, cash-flow, NL summary.  
3. Ask chatbot ≥3 questions (use the chips: Uber, biggest expense, groceries).  

## Team note

Core logic lives under `src/lib` and `src/app/api`. Everyone should own at least one area for Q&A.
