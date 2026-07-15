/** ISO 4217 currency helpers — detect from statement text/CSV and format safely. */

const ISO_CODES = [
  "USD",
  "EUR",
  "GBP",
  "AUD",
  "CAD",
  "NZD",
  "SGD",
  "HKD",
  "JPY",
  "CNY",
  "INR",
  "LKR",
  "PKR",
  "BDT",
  "NPR",
  "AED",
  "SAR",
  "QAR",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "ZAR",
  "THB",
  "MYR",
  "IDR",
  "PHP",
  "KRW",
  "MXN",
  "BRL",
] as const;

export type CurrencyCode = (typeof ISO_CODES)[number] | string;

const CODE_SET = new Set<string>(ISO_CODES);

const LOCALE_BY_CURRENCY: Record<string, string> = {
  USD: "en-US",
  EUR: "en-IE",
  GBP: "en-GB",
  AUD: "en-AU",
  CAD: "en-CA",
  NZD: "en-NZ",
  SGD: "en-SG",
  HKD: "en-HK",
  JPY: "ja-JP",
  CNY: "zh-CN",
  INR: "en-IN",
  LKR: "en-LK",
  PKR: "en-PK",
  BDT: "en-BD",
  AED: "en-AE",
  SAR: "en-SA",
  CHF: "de-CH",
  ZAR: "en-ZA",
  THB: "th-TH",
  MYR: "ms-MY",
  IDR: "id-ID",
  PHP: "en-PH",
  KRW: "ko-KR",
  MXN: "es-MX",
  BRL: "pt-BR",
};

const SYMBOL_HINTS: Array<{ pattern: RegExp; code: string; ambiguous?: boolean }> = [
  { pattern: /€/, code: "EUR" },
  { pattern: /£/, code: "GBP" },
  { pattern: /¥|￥/, code: "JPY" },
  { pattern: /₹/, code: "INR" },
  { pattern: /₽/, code: "RUB" },
  { pattern: /₩/, code: "KRW" },
  { pattern: /₪/, code: "ILS" },
  { pattern: /฿/, code: "THB" },
  { pattern: /(?:^|[^\w])Rs\.?\s?/i, code: "LKR", ambiguous: true },
  { pattern: /₨/, code: "LKR", ambiguous: true },
  { pattern: /A\$|AU\$/, code: "AUD" },
  { pattern: /C\$|CA\$/, code: "CAD" },
  { pattern: /NZ\$/, code: "NZD" },
  { pattern: /S\$|SG\$/, code: "SGD" },
  { pattern: /HK\$/, code: "HKD" },
  { pattern: /US\$/, code: "USD" },
  { pattern: /\$/, code: "USD", ambiguous: true },
];

const NAME_HINTS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\b(?:sri\s*lankan?\s*)?rupees?\b|\bLKR\b/i, code: "LKR" },
  { pattern: /\bindian\s*rupees?\b|\bINR\b/i, code: "INR" },
  { pattern: /\beuros?\b|\bEUR\b/i, code: "EUR" },
  { pattern: /\bpounds?\s*sterling\b|\bGBP\b/i, code: "GBP" },
  { pattern: /\baustralian\s*dollars?\b|\bAUD\b/i, code: "AUD" },
  { pattern: /\bcanadian\s*dollars?\b|\bCAD\b/i, code: "CAD" },
  { pattern: /\bsingapore\s*dollars?\b|\bSGD\b/i, code: "SGD" },
  { pattern: /\bus\s*dollars?\b|\bUSD\b|\bU\.S\.\s*dollars?\b/i, code: "USD" },
  { pattern: /\bdollars?\b/i, code: "USD" },
];

/** Validate / normalize to a known ISO code when possible. */
export function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (cleaned.length === 3 && CODE_SET.has(cleaned)) return cleaned;
  // Allow other valid-looking ISO codes (e.g. future)
  if (/^[A-Z]{3}$/.test(cleaned)) return cleaned;
  return null;
}

function scoreVotes(votes: Map<string, number>): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [code, score] of Array.from(votes.entries())) {
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Detect statement currency from headers, rows, free text, optional AI hint.
 * Priority: explicit column/header → ISO codes in text → symbols → AI hint → USD.
 */
export function detectCurrency(options: {
  headers?: string[];
  rows?: Array<Record<string, string>>;
  text?: string;
  amountSamples?: string[];
  aiHint?: string | null;
}): { code: string; source: string } {
  const votes = new Map<string, number>();

  const add = (code: string | null, weight: number) => {
    const n = normalizeCurrencyCode(code);
    if (!n) return;
    votes.set(n, (votes.get(n) ?? 0) + weight);
  };

  const headers = options.headers ?? [];
  const textBlob = [options.text ?? "", headers.join(" "), ...(options.amountSamples ?? [])].join(
    "\n"
  );

  // 1) Explicit Currency / CCY column values
  const currencyHeader = headers.find((h) =>
    ["currency", "ccy", "curr", "currency code", "curr code"].includes(
      h.trim().toLowerCase().replace(/[_-]+/g, " ")
    )
  );
  if (currencyHeader && options.rows?.length) {
    for (const row of options.rows.slice(0, 40)) {
      add(row[currencyHeader], 5);
    }
  }

  // 2) Currency embedded in amount column headers: "Debit (LKR)", "Amount USD"
  for (const h of headers) {
    const m =
      h.match(/\(([A-Za-z]{3})\)/) ||
      h.match(/\b([A-Za-z]{3})\b/) ||
      h.match(/(€|£|\$|₹|¥)/);
    if (m) {
      const code = normalizeCurrencyCode(m[1]) || symbolToCode(m[1], textBlob);
      add(code, 4);
    }
  }

  // 3) ISO codes & names in statement text
  for (const code of ISO_CODES) {
    const re = new RegExp(`\\b${code}\\b`, "i");
    if (re.test(textBlob)) add(code, 3);
  }
  for (const hint of NAME_HINTS) {
    if (hint.pattern.test(textBlob)) add(hint.code, 2);
  }

  // 4) Symbols in amount samples / text
  const sampleText = (options.amountSamples ?? []).join(" ") + "\n" + textBlob.slice(0, 4000);
  for (const hint of SYMBOL_HINTS) {
    if (!hint.pattern.test(sampleText)) continue;
    if (hint.ambiguous && hint.code === "USD") {
      // Disambiguate $ using regional cues
      if (/\bAUD\b|A\$|australia|woolworths|coles/i.test(textBlob)) add("AUD", 3);
      else if (/\bCAD\b|C\$|canada/i.test(textBlob)) add("CAD", 3);
      else if (/\bSGD\b|S\$|singapore/i.test(textBlob)) add("SGD", 3);
      else if (/\bNZD\b|NZ\$|new\s*zealand/i.test(textBlob)) add("NZD", 3);
      else if (/\bHKD\b|HK\$|hong\s*kong/i.test(textBlob)) add("HKD", 3);
      else add("USD", 2);
    } else if (hint.ambiguous && hint.code === "LKR") {
      if (/\bINR\b|india|₹/i.test(textBlob)) add("INR", 3);
      else if (/\bLKR\b|sri\s*lanka|colombo|keells|cargills/i.test(textBlob)) add("LKR", 3);
      else add("LKR", 1);
    } else {
      add(hint.code, 3);
    }
  }

  // 5) AI hint
  add(options.aiHint ?? null, 4);

  const winner = scoreVotes(votes);
  if (winner) {
    return {
      code: winner,
      source: votes.size ? "detected" : "default",
    };
  }

  return { code: "USD", source: "default" };
}

function symbolToCode(symbol: string, context: string): string | null {
  if (symbol === "€") return "EUR";
  if (symbol === "£") return "GBP";
  if (symbol === "₹") return "INR";
  if (symbol === "¥" || symbol === "￥") return "JPY";
  if (symbol === "$") {
    if (/\bAUD\b|A\$/i.test(context)) return "AUD";
    if (/\bCAD\b|C\$/i.test(context)) return "CAD";
    if (/\bSGD\b|S\$/i.test(context)) return "SGD";
    return "USD";
  }
  return normalizeCurrencyCode(symbol);
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string = "USD",
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const code = normalizeCurrencyCode(currency) || "USD";
  const locale = LOCALE_BY_CURRENCY[code] || "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: options?.maximumFractionDigits,
      minimumFractionDigits: options?.minimumFractionDigits,
    }).format(amount);
  } catch {
    // Invalid currency code fallback
    return `${code} ${amount.toLocaleString(locale, {
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
    })}`;
  }
}

/** Strip currency symbols/codes before numeric parse. */
export function stripCurrencyNoise(raw: string): string {
  return raw
    .replace(/US\$|A\$|AU\$|C\$|CA\$|NZ\$|S\$|SG\$|HK\$/gi, "")
    .replace(/(?:^|[^\w])Rs\.?\s?/gi, " ")
    .replace(/[€£¥￥₹₽₩₪฿₨$]/g, "")
    .replace(/\b(?:USD|EUR|GBP|AUD|CAD|LKR|INR|SGD|HKD|JPY|CNY|AED|SAR)\b/gi, "");
}
