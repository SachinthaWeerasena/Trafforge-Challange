import OpenAI from "openai";

export type AiProviderId = "groq" | "gemini" | "openrouter" | "ollama" | "openai";

export interface AiProviderConfig {
  id: AiProviderId;
  label: string;
  client: OpenAI;
  model: string;
  /** Some free endpoints are flaky with response_format=json_object */
  supportsJsonMode: boolean;
  free: boolean;
}

export interface ChatCompleteResult {
  content: string;
  provider: AiProviderId;
  model: string;
}

/**
 * Free-first provider chain for the hackathon:
 * 1. Groq — fastest free chat (best live demo UX)
 * 2. Gemini — strong free quality (summary / categorize / PDF)
 * 3. OpenRouter free models — spare capacity
 * 4. Ollama — local, $0, privacy-friendly
 * 5. OpenAI — optional paid fallback
 */
export function getConfiguredProviders(): AiProviderConfig[] {
  const providers: AiProviderConfig[] = [];

  if (process.env.GROQ_API_KEY) {
    providers.push({
      id: "groq",
      label: "Groq (free)",
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
      }),
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      supportsJsonMode: true,
      free: true,
    });
  }

  if (process.env.GEMINI_API_KEY) {
    providers.push({
      id: "gemini",
      label: "Google Gemini (free)",
      client: new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      supportsJsonMode: true,
      free: true,
    });
  }

  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      id: "openrouter",
      label: "OpenRouter free",
      client: new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
          "X-Title": "StatementInsight",
        },
      }),
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
      supportsJsonMode: false,
      free: true,
    });
  }

  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_ENABLED === "true") {
    providers.push({
      id: "ollama",
      label: "Ollama (local free)",
      client: new OpenAI({
        apiKey: process.env.OLLAMA_API_KEY || "ollama",
        baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
      }),
      model: process.env.OLLAMA_MODEL || "llama3.2",
      supportsJsonMode: false,
      free: true,
    });
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      id: "openai",
      label: "OpenAI",
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      supportsJsonMode: true,
      free: false,
    });
  }

  return providers;
}

export function isAiConfigured(): boolean {
  return getConfiguredProviders().length > 0;
}

export function getAiStatus() {
  const all = [
    { id: "groq" as const, env: "GROQ_API_KEY", free: true, recommended: true },
    { id: "gemini" as const, env: "GEMINI_API_KEY", free: true, recommended: true },
    { id: "openrouter" as const, env: "OPENROUTER_API_KEY", free: true, recommended: false },
    {
      id: "ollama" as const,
      env: "OLLAMA_ENABLED or OLLAMA_BASE_URL",
      free: true,
      recommended: false,
    },
    { id: "openai" as const, env: "OPENAI_API_KEY", free: false, recommended: false },
  ];

  const configured = getConfiguredProviders();
  return {
    configured: configured.map((p) => ({
      id: p.id,
      label: p.label,
      model: p.model,
      free: p.free,
    })),
    available: all.map((a) => ({
      ...a,
      ready:
        a.id === "ollama"
          ? Boolean(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_ENABLED === "true")
          : configured.some((c) => c.id === a.id),
    })),
    primary: configured[0]?.id ?? null,
  };
}

export async function chatComplete(options: {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  temperature?: number;
  json?: boolean;
  preferred?: AiProviderId[];
}): Promise<ChatCompleteResult | null> {
  let providers = getConfiguredProviders();
  if (!providers.length) return null;

  if (options.preferred?.length) {
    const preferred = providers.filter((p) => options.preferred!.includes(p.id));
    const rest = providers.filter((p) => !options.preferred!.includes(p.id));
    providers = [...preferred, ...rest];
  }

  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const useJson = Boolean(options.json && provider.supportsJsonMode);
      const completion = await provider.client.chat.completions.create({
        model: provider.model,
        temperature: options.temperature ?? 0.2,
        messages: options.messages,
        ...(useJson ? { response_format: { type: "json_object" as const } } : {}),
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) throw new Error("Empty completion");

      return { content, provider: provider.id, model: provider.model };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.id}: ${msg}`);
      console.warn(`[ai] ${provider.id} failed:`, msg);

      // Retry same provider without json mode once
      if (options.json && provider.supportsJsonMode) {
        try {
          const completion = await provider.client.chat.completions.create({
            model: provider.model,
            temperature: options.temperature ?? 0.2,
            messages: [
              ...options.messages,
              {
                role: "system",
                content: "Respond with valid JSON only. No markdown fences.",
              },
            ],
          });
          const content = completion.choices[0]?.message?.content?.trim();
          if (content) {
            return { content, provider: provider.id, model: provider.model };
          }
        } catch (retryErr) {
          errors.push(
            `${provider.id}-retry: ${
              retryErr instanceof Error ? retryErr.message : String(retryErr)
            }`
          );
        }
      }
    }
  }

  console.error("[ai] all providers failed", errors);
  return null;
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        /* fall through */
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Could not parse JSON from model output");
  }
}
