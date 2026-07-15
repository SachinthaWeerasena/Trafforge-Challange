import type { AnalysisResult, Transaction, TransactionCategory } from "./types";
import { CATEGORY_LABELS } from "./categories";
import { formatMoney, normalizeCurrencyCode } from "./currency";
import {
  chatComplete,
  extractJsonObject,
  isAiConfigured,
  type AiProviderId,
} from "./ai-client";

export { isAiConfigured, getAiStatus } from "./ai-client";

export type AiFeature =
  | "pdf_extract"
  | "categorize"
  | "summary"
  | "coach"
  | "anomalies"
  | "chat";

export interface AiRunMeta {
  used: boolean;
  provider: AiProviderId | null;
  providersTried: AiProviderId[];
  features: AiFeature[];
}

export interface PdfExtractResult {
  transactions: Array<{
    date: string;
    description: string;
    debit: number | null;
    credit: number | null;
    balance: number | null;
    reference: string | null;
  }>;
  currencyHint: string | null;
}

function emptyMeta(): AiRunMeta {
  return { used: false, provider: null, providersTried: [], features: [] };
}

function track(
  meta: AiRunMeta,
  feature: AiFeature,
  provider: AiProviderId | null
) {
  if (!meta.features.includes(feature)) meta.features.push(feature);
  if (provider) {
    meta.used = true;
    meta.provider = meta.provider ?? provider;
    if (!meta.providersTried.includes(provider)) meta.providersTried.push(provider);
  }
}

export async function extractTransactionsFromPdfText(
  text: string,
  meta: AiRunMeta = emptyMeta()
): Promise<PdfExtractResult> {
  if (!isAiConfigured()) {
    return { transactions: fallbackPdfExtract(text), currencyHint: null };
  }

  const truncated = text.slice(0, 14000);
  const result = await chatComplete({
    temperature: 0,
    json: true,
    preferred: ["gemini", "groq", "openrouter", "openai", "ollama"],
    messages: [
      {
        role: "system",
        content:
          'Extract bank statement transactions into JSON. Return {"currency":"ISO-4217 code e.g. USD|LKR|EUR|GBP|AUD","transactions":[{"date":"YYYY-MM-DD","description":"...","debit":number|null,"credit":number|null,"balance":number|null,"reference":string|null}]}. Detect currency from symbols, codes, or wording on the statement. Debits = money out, credits = money in. Never invent transactions.',
      },
      {
        role: "user",
        content: `Extract currency and all transactions from this statement text:\n\n${truncated}`,
      },
    ],
  });

  if (!result) {
    return { transactions: fallbackPdfExtract(text), currencyHint: null };
  }

  track(meta, "pdf_extract", result.provider);
  try {
    const parsed = extractJsonObject(result.content) as {
      currency?: string;
      transactions?: unknown[];
    };
    if (!Array.isArray(parsed.transactions) || !parsed.transactions.length) {
      return { transactions: fallbackPdfExtract(text), currencyHint: normalizeCurrencyCode(parsed.currency) };
    }
    return {
      currencyHint: normalizeCurrencyCode(parsed.currency),
      transactions: parsed.transactions
        .map((t) => normalizeAiTxn(t))
        .filter((t): t is NonNullable<typeof t> => Boolean(t)),
    };
  } catch {
    return { transactions: fallbackPdfExtract(text), currencyHint: null };
  }
}

function normalizeAiTxn(t: unknown) {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  const description = String(o.description ?? "").trim();
  const date = String(o.date ?? "").trim();
  if (!description || !date) return null;
  const num = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    date,
    description,
    debit: num(o.debit),
    credit: num(o.credit),
    balance: num(o.balance),
    reference: o.reference ? String(o.reference) : null,
  };
}

/** Regex / line heuristic when no API key — works for tabular PDF text dumps */
export function fallbackPdfExtract(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const txns: Array<{
    date: string;
    description: string;
    debit: number | null;
    credit: number | null;
    balance: number | null;
    reference: string | null;
  }> = [];

  const lineRe =
    /^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})(?:\s+(-?[\d,]+\.\d{2}))?(?:\s+(-?[\d,]+\.\d{2}))?$/;

  for (const line of lines) {
    const m = line.match(lineRe);
    if (!m) continue;
    const amounts = [m[3], m[4], m[5]]
      .filter(Boolean)
      .map((a) => Number(String(a).replace(/,/g, "")));
    let debit: number | null = null;
    let credit: number | null = null;
    let balance: number | null = null;
    if (amounts.length === 1) {
      if (amounts[0] < 0) debit = Math.abs(amounts[0]);
      else debit = amounts[0];
    } else if (amounts.length === 2) {
      debit = amounts[0];
      balance = amounts[1];
    } else if (amounts.length >= 3) {
      debit = amounts[0] || null;
      credit = amounts[1] || null;
      balance = amounts[2] ?? null;
      if (debit === 0) debit = null;
      if (credit === 0) credit = null;
    }
    txns.push({
      date: toIsoDate(m[1]),
      description: m[2].trim(),
      debit,
      credit,
      balance,
      reference: null,
    });
  }
  return txns;
}

function toIsoDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return s;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** AI categorizes all (or uncertain) transactions in one batch. */
export async function aiCategorizeTransactions(
  transactions: Array<{
    date: string;
    description: string;
    category: string;
    categoryConfidence: number;
  }>,
  meta: AiRunMeta = emptyMeta()
): Promise<Map<string, TransactionCategory>> {
  const result = new Map<string, TransactionCategory>();
  if (!isAiConfigured()) return result;

  // Prefer uncertain / other; if few, send full set for better AI coverage
  let targets = transactions.filter(
    (t) => t.category === "other" || t.categoryConfidence < 0.9
  );
  if (targets.length < 8) targets = transactions;
  targets = targets.slice(0, 50);
  if (!targets.length) return result;

  const labels = Object.keys(CATEGORY_LABELS).join(", ");
  const completion = await chatComplete({
    temperature: 0,
    json: true,
    preferred: ["groq", "gemini", "openrouter", "openai", "ollama"],
    messages: [
      {
        role: "system",
        content: `Categorize bank transactions. Allowed categories only: ${labels}. Return {"items":[{"index":0,"category":"transport"}]}. Prefer specific categories over "other".`,
      },
      {
        role: "user",
        content: JSON.stringify(
          targets.map((t, index) => ({
            index,
            description: t.description,
            hint: t.category,
          }))
        ),
      },
    ],
  });

  if (!completion) return result;
  track(meta, "categorize", completion.provider);

  try {
    const parsed = extractJsonObject(completion.content) as {
      items?: Array<{ index: number; category: string }>;
    };
    for (const item of parsed.items ?? []) {
      const src = targets[item.index];
      if (!src) continue;
      const cat = item.category as TransactionCategory;
      if (!(cat in CATEGORY_LABELS)) continue;
      result.set(`${src.date}|${src.description}`, cat);
    }
  } catch (err) {
    console.warn("[ai] categorize parse failed", err);
  }
  return result;
}

export async function generateAiSummary(
  context: {
    currency: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ category: string; total: number; percentOfExpenses: number }>;
    cashFlow: Array<{ month: string; inflows: number; outflows: number; net: number }>;
    unusualSpikes: Array<{ description: string; amount: number }>;
  },
  meta: AiRunMeta = emptyMeta()
): Promise<string | null> {
  const completion = await chatComplete({
    temperature: 0.4,
    preferred: ["gemini", "groq", "openrouter", "openai", "ollama"],
    messages: [
      {
        role: "system",
        content:
          `You are Finn, the Finsight money assistant. Write 2-4 plain-English sentences summarizing this bank statement. All money amounts MUST use currency ${context.currency} (correct symbol/code). Mention % changes when possible. No bullet lists. Do not invent figures not in the data.`,
      },
      { role: "user", content: JSON.stringify(context) },
    ],
  });

  if (!completion) return null;
  track(meta, "summary", completion.provider);
  return completion.content;
}

export async function generateAiCoachInsights(
  context: {
    currency: string;
    totalIncome: number;
    totalExpenses: number;
    savingsRate: number;
    topCategories: Array<{ category: string; total: number; percentOfExpenses: number }>;
    recurring: Array<{ merchant: string; averageAmount: number; occurrences: number }>;
    bonus: {
      duplicateCount: number;
      feeCount: number;
      cashPct: number;
      salaryNote: string;
      ruleSuggestions: string[];
    };
  },
  meta: AiRunMeta = emptyMeta()
): Promise<{ tips: string[]; anomalyInsight: string } | null> {
  const completion = await chatComplete({
    temperature: 0.35,
    json: true,
    preferred: ["groq", "gemini", "openrouter", "openai", "ollama"],
    messages: [
      {
        role: "system",
        content:
          `You are Finn, the Finsight money assistant. Currency is ${context.currency}. Return JSON {"tips":["...","...","..."],"anomalyInsight":"one short paragraph"}. tips = 3 actionable saving / budget tips grounded ONLY in the data, using ${context.currency} for any amounts. anomalyInsight explains duplicates, fees, cash-heavy spend, or spikes. No invented numbers.`,
      },
      { role: "user", content: JSON.stringify(context) },
    ],
  });

  if (!completion) return null;
  track(meta, "coach", completion.provider);
  track(meta, "anomalies", completion.provider);

  try {
    const parsed = extractJsonObject(completion.content) as {
      tips?: string[];
      anomalyInsight?: string;
    };
    return {
      tips: (parsed.tips ?? []).filter(Boolean).slice(0, 5),
      anomalyInsight: parsed.anomalyInsight?.trim() || "",
    };
  } catch {
    return null;
  }
}

export async function chatAboutStatement(
  question: string,
  transactions: Transaction[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
  analysisHint?: Pick<
    AnalysisResult,
    | "totalIncome"
    | "totalExpenses"
    | "savingsRate"
    | "topCategories"
    | "naturalLanguageSummary"
    | "currency"
  >
): Promise<{ answer: string; provider: AiProviderId | null }> {
  const currency = analysisHint?.currency || "USD";
  const compact = transactions.slice(0, 120).map((t) => ({
    date: t.date,
    description: t.maskedDescription,
    debit: t.debit,
    credit: t.credit,
    category: t.category,
  }));

  const local = answerLocally(question, transactions, currency);
  if (!isAiConfigured()) {
    return {
      answer:
        local ??
        "No free AI key configured. Add GROQ_API_KEY or GEMINI_API_KEY in .env.local. Local fallback couldn't answer that.",
      provider: null,
    };
  }

  const completion = await chatComplete({
    temperature: 0.2,
    preferred: ["groq", "gemini", "openrouter", "openai", "ollama"],
    messages: [
      {
        role: "system",
        content:
          `You are Finn, the Finsight money assistant. Answer ONLY from the provided transactions and metrics. Currency is ${currency} — format all money in ${currency}. Masked PII is intentional. Be concise and confident — no apology-filler. If unknown, say so. Prefer exact totals.`,
      },
      {
        role: "user",
        content: `Metrics: ${JSON.stringify({
          currency,
          totalIncome: analysisHint?.totalIncome,
          totalExpenses: analysisHint?.totalExpenses,
          savingsRate: analysisHint?.savingsRate,
          topCategories: analysisHint?.topCategories?.slice(0, 5),
          summary: analysisHint?.naturalLanguageSummary,
        })}\nTransactions JSON:\n${JSON.stringify(compact)}\n\nLocal hint: ${local ?? "none"}`,
      },
      ...history.slice(-6),
      { role: "user", content: question },
    ],
  });

  return {
    answer:
      completion?.content ||
      local ||
      "I couldn't generate an answer.",
    provider: completion?.provider ?? null,
  };
}

function answerLocally(
  question: string,
  transactions: Transaction[],
  currency: string
): string | null {
  const q = question.toLowerCase();
  const money = (n: number) => formatMoney(n, currency);

  const sumCategory = (cat: string) =>
    transactions
      .filter((t) => t.category === cat && t.debit)
      .reduce((s, t) => s + (t.debit ?? 0), 0);

  const sumMerchant = (needle: RegExp) =>
    transactions
      .filter((t) => needle.test(t.description) && t.debit)
      .reduce((s, t) => s + (t.debit ?? 0), 0);

  if (/uber/i.test(q)) {
    const total = sumMerchant(/\buber\b/i);
    return `You spent ${money(total)} on Uber in this statement.`;
  }
  if (/netflix|spotify|subscription/i.test(q)) {
    const total = sumCategory("subscriptions");
    return `Subscription-related spend totals ${money(total)}.`;
  }
  if (/grocery|groceries/i.test(q)) {
    return `Grocery spend totals ${money(sumCategory("groceries"))}.`;
  }
  if (/dining|restaurant|food/i.test(q)) {
    return `Dining spend totals ${money(sumCategory("dining"))}.`;
  }
  if (/how much.*(spend|spent)|total (expense|spend)/i.test(q)) {
    const total = transactions.reduce((s, t) => s + (t.debit ?? 0), 0);
    return `Total expenses in this statement: ${money(total)}.`;
  }
  if (/income|salary|earn/i.test(q)) {
    const total = transactions.reduce((s, t) => s + (t.credit ?? 0), 0);
    return `Total income/credits in this statement: ${money(total)}.`;
  }
  if (/biggest|largest/i.test(q)) {
    const top = [...transactions]
      .filter((t) => t.debit)
      .sort((a, b) => (b.debit ?? 0) - (a.debit ?? 0))[0];
    if (!top) return "No expenses found.";
    return `Largest expense: ${money(top.debit!)} on ${top.maskedDescription} (${top.date}).`;
  }
  return null;
}

export function createAiMeta(): AiRunMeta {
  return emptyMeta();
}
