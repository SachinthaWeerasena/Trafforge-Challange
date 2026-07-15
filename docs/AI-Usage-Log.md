# AI Usage Log

Log of AI tools used during the StatementInsight hackathon build. Entries reflect actual usage.

| # | Tool | Purpose | Prompt / instruction (summary) | Used as-is or modified? |
|---|------|---------|--------------------------------|-------------------------|
| 1 | Cursor Agent (Composer) | Scaffold Next.js app, implement parsers, APIs, UI, docs | Hackathon brief: build working statement analyzer with AI-in-product features and required documentation | **Modified** — iterative coding, not a single pasted scaffold |
| 2 | Groq / Gemini / OpenRouter / Ollama / OpenAI | Runtime multi-provider failover | Shared chat-completions prompts for PDF extract, categorize, summary, coach/anomalies, chatbot | **As-built** in `ai-client.ts` + `openai.ts` |
| 3 | Free AI keys (prefer Groq + Gemini) | Product AI (not just coding) | See `.env.example` | Team-supplied keys at runtime |

## Notes

- Coding assistant output was reviewed and adapted (privacy flags, hybrid rules+AI categorization, deterministic insight engine for accuracy).
- Runtime AI calls require `OPENAI_API_KEY` in `.env.local`. Without it, rule/heuristic paths keep the product demoable for CSV.
- Model override supported via `OPENAI_MODEL` env var (default `gpt-4o-mini`).
