# Privacy & Security Notes

Recommended (not mandatory) submission notes — reflects as-built behavior.

## Data handling

- **No database / no file store** for statements. Upload is processed in the API request memory; the client keeps analysis JSON in React state only.
- **Opt-in checkbox** exposes intent (`optInStore`) but this build still returns `stored: false` — honest about not implementing retention yet.
- **Sample data only** shipped under `public/samples/`. Do not upload real customer statements during the hackathon.

## PII controls

- Descriptions run through `maskDescription` (long digit sequences, card patterns, emails, phones).
- Account hints surfaced as `••••` + last 4 via `maskAccountNumber` / `extractAccountHint`.
- Chatbot is instructed to use masked descriptions; payloads should not reintroduce raw file bytes.
- PDF passwords (when needed) are sent only for the analyze request to decrypt in memory and are **not stored**.

## API / AI security

- `OPENAI_API_KEY` lives in server-side `.env.local` only — never exposed to the browser bundle.
- LLM prompts receive **truncated** PDF text and **capped** transaction arrays to limit leakage and cost.
- Responses from the model are treated as untrusted text and rendered as plain text (no `dangerouslySetInnerHTML`).

## Threat notes (known limitations)

- Session analysis can still be screen-captured or logged by the user’s browser extensions.
- Without TLS termination in local demo (`localhost`), use HTTPS in any shared deploy.
- PDF regex fallback is weaker than OCR — scanned image PDFs need better tooling (out of scope).

## Demo hygiene

- Clear the page with **New upload** between personal test files.
- Prefer wiping browser tab after the presentation.
