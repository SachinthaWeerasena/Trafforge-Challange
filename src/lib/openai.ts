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
  const heuristic = fallbackPdfExtract(text);

  if (!isAiConfigured()) {
    return { transactions: heuristic, currencyHint: null };
  }

  // Prefer mid/body of statement (headers are page 1 noise); send multiple chunks
  const chunks = chunkStatementText(text, 12000, 3);
  let currencyHint: string | null = null;
  const aiTxns: PdfExtractResult["transactions"] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const result = await chatComplete({
      temperature: 0,
      json: true,
      preferred: ["groq", "gemini", "openrouter", "openai", "ollama"],
      messages: [
        {
          role: "system",
          content:
            'Extract bank statement transactions into JSON. Return {"currency":"ISO-4217 code e.g. USD|LKR|EUR|GBP|AUD","transactions":[{"date":"YYYY-MM-DD","description":"...","debit":number|null,"credit":number|null,"balance":number|null,"reference":string|null}]}. Dates on LKR statements are usually DD/MM/YYYY — convert to YYYY-MM-DD. Debits = money out, credits = money in. Skip opening/closing balance header rows. Never invent transactions. If a row has only one amount column, put withdraws in debit and deposits in credit.',
        },
        {
          role: "user",
          content: `Extract currency and all transactions from this statement text:\n\n${chunk}`,
        },
      ],
    });

    if (!result) continue;
    track(meta, "pdf_extract", result.provider);

    try {
      const parsed = extractJsonObject(result.content) as {
        currency?: string;
        transactions?: unknown[];
      };
      currencyHint = currencyHint ?? normalizeCurrencyCode(parsed.currency);
      if (!Array.isArray(parsed.transactions)) continue;
      for (const t of parsed.transactions) {
        const n = normalizeAiTxn(t);
        if (!n) continue;
        const key = `${n.date}|${n.description}|${n.debit}|${n.credit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        aiTxns.push(n);
      }
    } catch {
      /* try next chunk */
    }
  }

  // Merge AI + heuristic (AI first, then fill gaps)
  const merged = [...aiTxns];
  for (const h of heuristic) {
    const key = `${h.date}|${h.description}|${h.debit}|${h.credit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(h);
  }

  return {
    currencyHint,
    transactions: merged.length ? merged : heuristic,
  };
}

function chunkStatementText(text: string, size: number, maxChunks: number): string[] {
  const cleaned = text.replace(/\u00a0/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= size) return [cleaned];

  const parts: string[] = [];
  // Start slightly into the doc to skip cover noise, then walk forward
  let start = Math.min(800, Math.floor(cleaned.length * 0.05));
  while (parts.length < maxChunks && start < cleaned.length) {
    parts.push(cleaned.slice(start, start + size));
    start += size - 400; // overlap
  }
  return parts;
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

/** Regex / line heuristic when AI misses rows — tuned for LKR / Asian bank PDFs */
export function fallbackPdfExtract(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const txns: Array<{
    date: string;
    description: string;
    debit: number | null;
    credit: number | null;
    balance: number | null;
    reference: string | null;
  }> = [];

  const seen = new Set<string>();

  const push = (row: (typeof txns)[number]) => {
    if (!row.description || !row.date) return;
    if (row.debit == null && row.credit == null) return;
    const key = `${row.date}|${row.description}|${row.debit}|${row.credit}|${row.balance}`;
    if (seen.has(key)) return;
    seen.add(key);
    txns.push(row);
  };

  const amountToken = /-?[\d,]+\.\d{2}/g;
  const dateRe =
    /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;

  // Strict one-line: date + desc + 1–3 amounts
  const lineRe =
    /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})\s+(.+?)\s+(-?[\d,]+\.\d{2})(?:\s+(-?[\d,]+\.\d{2}))?(?:\s+(-?[\d,]+\.\d{2}))?\s*$/;

  for (const line of lines) {
    if (/^---\s*page/i.test(line) || /balance\s*(brought|b\/f|carried|c\/f)/i.test(line)) {
      continue;
    }

    // Tabular rows from getTable / cellSeparator
    if (line.includes("\t")) {
      const cells = line.split(/\t+/).map((c) => c.trim()).filter(Boolean);
      const dateCell = cells.find((c) => dateRe.test(c));
      if (dateCell) {
        const dateMatch = dateCell.match(dateRe);
        const amounts = cells
          .flatMap((c) => c.match(amountToken) ?? [])
          .map((a) => Number(a.replace(/,/g, "")))
          .filter((n) => Number.isFinite(n));
        const desc = cells
          .filter((c) => c !== dateCell && !/^[\d,.]+$/.test(c.replace(/\s/g, "")))
          .join(" ")
          .trim();
        if (dateMatch && desc && amounts.length) {
          const { debit, credit, balance } = assignAmounts(amounts, line);
          push({
            date: toIsoDate(dateMatch[1]),
            description: desc,
            debit,
            credit,
            balance,
            reference: null,
          });
          continue;
        }
      }
    }

    const m = line.match(lineRe);
    if (m) {
      const amounts = [m[3], m[4], m[5]]
        .filter(Boolean)
        .map((a) => Number(String(a).replace(/,/g, "")));
      const { debit, credit, balance } = assignAmounts(amounts, line);
      push({
        date: toIsoDate(m[1]),
        description: m[2].trim(),
        debit,
        credit,
        balance,
        reference: null,
      });
      continue;
    }

    // Looser: date somewhere near start + amounts at end
    const dm = line.match(dateRe);
    const amounts = [...(line.match(amountToken) ?? [])].map((a) =>
      Number(a.replace(/,/g, ""))
    );
    if (dm && amounts.length >= 1) {
      const desc = line
        .replace(dm[0], " ")
        .replace(/-?[\d,]+\.\d{2}/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (desc.length < 2) continue;
      // Skip headers / totals
      if (/^(date|description|particulars|debit|credit|balance|txn)/i.test(desc)) continue;
      const { debit, credit, balance } = assignAmounts(amounts, line);
      push({
        date: toIsoDate(dm[1]),
        description: desc,
        debit,
        credit,
        balance,
        reference: null,
      });
    }
  }

  return txns;
}

function assignAmounts(amounts: number[], line: string) {
  let debit: number | null = null;
  let credit: number | null = null;
  let balance: number | null = null;

  const lower = line.toLowerCase();
  const looksCredit =
    /\b(cr|credit|deposit|interest|salary|refund|inflow)\b/i.test(lower) ||
    /cr\b/i.test(line);

  if (amounts.length === 1) {
    if (looksCredit) credit = Math.abs(amounts[0]);
    else if (amounts[0] < 0) debit = Math.abs(amounts[0]);
    else debit = amounts[0];
  } else if (amounts.length === 2) {
    // amount + balance (common)
    if (looksCredit) credit = Math.abs(amounts[0]);
    else debit = Math.abs(amounts[0]) || null;
    balance = amounts[1];
  } else {
    debit = amounts[0] || null;
    credit = amounts[1] || null;
    balance = amounts[2] ?? null;
    if (debit === 0) debit = null;
    if (credit === 0) credit = null;
  }

  return { debit, credit, balance };
}

function toIsoDate(s: string): string {
  const cleaned = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;

  const named = cleaned.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})$/i
  );
  if (named) {
    const months: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mon = months[named[2].slice(0, 3).toLowerCase()];
    const year = named[3].length === 2 ? `20${named[3]}` : named[3];
    return `${year}-${mon}-${named[1].padStart(2, "0")}`;
  }

  const m = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return cleaned;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  // Prefer DD/MM/YYYY (common for LKR statements)
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  return `${year}-${month}-${day}`;
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
