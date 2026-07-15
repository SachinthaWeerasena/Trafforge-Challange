import Papa from "papaparse";
import { detectCurrency, stripCurrencyNoise } from "./currency";
import type { RawTransaction } from "./types";

const FIELD_ALIASES: Record<keyof RawTransaction, string[]> = {
  date: [
    "date",
    "txn date",
    "transaction date",
    "trans date",
    "tran date",
    "value date",
    "posted",
    "posted date",
    "posting date",
    "booking date",
    "wertstellung",
  ],
  description: [
    "description",
    "narration",
    "details",
    "particulars",
    "particular",
    "merchant",
    "payee",
    "memo",
    "remarks",
    "transaction details",
    "tran particular",
    "narrative",
  ],
  debit: [
    "debit",
    "withdrawal",
    "withdrawals",
    "money out",
    "out",
    "expense",
    "dr",
    "debit amount",
    "withdrawal amount",
    "payments",
    "paid out",
  ],
  credit: [
    "credit",
    "deposit",
    "deposits",
    "money in",
    "in",
    "income",
    "cr",
    "credit amount",
    "deposit amount",
    "paid in",
    "receipts",
  ],
  balance: [
    "balance",
    "running balance",
    "available balance",
    "bal",
    "ledger balance",
    "closing balance",
  ],
  reference: [
    "reference",
    "ref",
    "ref no",
    "ref.",
    "transaction id",
    "txn id",
    "cheque",
    "check no",
    "tran id",
    "trace",
  ],
};

const AMOUNT_ALIASES = [
  "amount",
  "txn amount",
  "transaction amount",
  "tran amount",
  "amt",
  "value",
];
const TYPE_ALIASES = [
  "type",
  "dr/cr",
  "d/c",
  "transaction type",
  "tran type",
  "debit/credit",
  "dc",
];

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/^\uFFFE/, "");
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[_./\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDelimiter(sample: string): string {
  const firstLines = sample
    .split(/\r?\n/)
    .slice(0, 8)
    .filter((l) => l.trim().length > 0);
  const joined = firstLines.join("\n");
  const counts = [
    { d: ",", n: (joined.match(/,/g) || []).length },
    { d: ";", n: (joined.match(/;/g) || []).length },
    { d: "\t", n: (joined.match(/\t/g) || []).length },
    { d: "|", n: (joined.match(/\|/g) || []).length },
  ];
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

/** Find the header row index when banks prepend title/metadata lines. */
function findHeaderLineIndex(lines: string[], delimiter: string): number {
  const maxScan = Math.min(lines.length, 40);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < maxScan; i++) {
    const cols = lines[i].split(delimiter).map(normalizeHeader);
    if (cols.length < 2) continue;
    let score = 0;
    const allAliases = Object.values(FIELD_ALIASES).flat().concat(AMOUNT_ALIASES, TYPE_ALIASES);
    for (const c of cols) {
      if (allAliases.includes(c)) score += 3;
      else if (/date|desc|debit|credit|amount|balance|narrat|particular/i.test(c))
        score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestScore >= 3 ? bestIdx : 0;
}

function mapHeaders(headers: string[]): Partial<Record<keyof RawTransaction, string>> {
  const map: Partial<Record<keyof RawTransaction, string>> = {};
  const normalized = headers.map(normalizeHeader);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [keyof RawTransaction, string[]]
  >) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[field] = headers[idx];
  }
  // Fuzzy contains match if exact alias missed
  if (!map.date) {
    const idx = normalized.findIndex((h) => h.includes("date") && !h.includes("value date update"));
    if (idx >= 0) map.date = headers[idx];
  }
  if (!map.description) {
    const idx = normalized.findIndex(
      (h) =>
        h.includes("desc") ||
        h.includes("narrat") ||
        h.includes("particular") ||
        h.includes("remark")
    );
    if (idx >= 0) map.description = headers[idx];
  }
  return map;
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let raw = String(value).trim();
  if (!raw || raw === "-" || raw === "—" || raw === "–") return null;
  raw = stripCurrencyNoise(raw);
  // European thousands: 1.234,56
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(,\d{3})+\.\d{2}$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  } else {
    raw = raw.replace(/[, ]/g, "");
  }
  raw = raw.replace(/[()]/g, (c) => (c === "(" ? "-" : ""));
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Prefer DD/MM/YYYY for slash dates (common on LKR / EU bank CSVs). */
function parseDate(value: unknown): string {
  if (!value) return "";
  const s = String(value).trim();
  if (!s) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const named = s.match(
    /^(\d{1,2})[\/\-\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-\s]+(\d{2,4})$/i
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

  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    // If first > 12 → must be DD/MM; if second > 12 → MM/DD; else assume DD/MM
    let day: string;
    let month: string;
    if (a > 12 && b <= 12) {
      day = String(a).padStart(2, "0");
      month = String(b).padStart(2, "0");
    } else if (b > 12 && a <= 12) {
      month = String(a).padStart(2, "0");
      day = String(b).padStart(2, "0");
    } else {
      day = String(a).padStart(2, "0");
      month = String(b).padStart(2, "0");
    }
    return `${year}-${month}-${day}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function findHeaderKey(headers: string[], aliases: string[]): string | undefined {
  const normalized = headers.map(normalizeHeader);
  const idx = normalized.findIndex((h) => aliases.includes(h));
  return idx >= 0 ? headers[idx] : undefined;
}

export interface ParsedCsvStatement {
  transactions: RawTransaction[];
  currency: string;
  currencySource: string;
}

export function parseCsvStatement(csvText: string): ParsedCsvStatement {
  let text = stripBom(String(csvText ?? ""));
  if (!text.trim()) {
    throw new Error("CSV file is empty.");
  }

  const delimiter = detectDelimiter(text);
  const lines = text.split(/\r?\n/);
  const headerIdx = findHeaderLineIndex(lines, delimiter);
  if (headerIdx > 0) {
    text = lines.slice(headerIdx).join("\n");
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter,
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });

  if (parsed.errors.length && !parsed.data.length) {
    throw new Error(`CSV parse failed: ${parsed.errors[0]?.message ?? "unknown error"}`);
  }

  const headers = (parsed.meta.fields ?? Object.keys(parsed.data[0] ?? {})).map((h) =>
    h.replace(/^\uFEFF/, "").trim()
  );
  const map = mapHeaders(headers);

  if (!map.date || !map.description) {
    throw new Error(
      `CSV must include Date and Description columns (found: ${headers.join(", ") || "none"}). Aliases like Txn Date, Particulars, Narration are supported.`
    );
  }

  const amountHeader = findHeaderKey(headers, AMOUNT_ALIASES);
  const typeHeader = findHeaderKey(headers, TYPE_ALIASES);

  const amountSamples: string[] = [];
  const transactions = parsed.data
    .map((row) => {
      // Normalize keys in case BOM/spacing differs on lookup
      const get = (header: string | undefined) => {
        if (!header) return "";
        if (row[header] !== undefined) return row[header];
        const found = Object.keys(row).find(
          (k) => normalizeHeader(k) === normalizeHeader(header)
        );
        return found ? row[found] : "";
      };

      let debit = map.debit ? parseAmount(get(map.debit)) : null;
      let credit = map.credit ? parseAmount(get(map.credit)) : null;

      if (map.debit && get(map.debit)) amountSamples.push(String(get(map.debit)));
      if (map.credit && get(map.credit)) amountSamples.push(String(get(map.credit)));
      if (amountHeader && get(amountHeader)) amountSamples.push(String(get(amountHeader)));

      // Single Amount (+ optional Type) column
      if (amountHeader && debit == null && credit == null) {
        const amt = parseAmount(get(amountHeader));
        if (amt !== null) {
          const type = typeHeader ? String(get(typeHeader) ?? "").toLowerCase() : "";
          if (
            type.includes("cr") ||
            type.includes("credit") ||
            type.includes("deposit") ||
            type === "c" ||
            type.includes("in")
          ) {
            credit = Math.abs(amt);
            debit = null;
          } else if (amt < 0) {
            debit = Math.abs(amt);
            credit = null;
          } else if (
            type.includes("dr") ||
            type.includes("debit") ||
            type.includes("withdraw") ||
            type === "d" ||
            type.includes("out")
          ) {
            debit = Math.abs(amt);
            credit = null;
          } else if (!type) {
            // No type column: positive = debit (money out) by bank-export convention fall back;
            // many banks put signed amounts (negative = outflow)
            debit = Math.abs(amt);
            credit = null;
          } else {
            debit = Math.abs(amt);
            credit = null;
          }
        }
      }

      // If both filled with same logic noise, keep as-is
      const date = parseDate(get(map.date));
      const description = String(get(map.description) ?? "").trim();

      return {
        date,
        description,
        debit,
        credit,
        balance: map.balance ? parseAmount(get(map.balance)) : null,
        reference: map.reference
          ? String(get(map.reference) ?? "").trim() || null
          : null,
      } satisfies RawTransaction;
    })
    .filter((t) => t.date && t.description)
    // Drop pure header/total leftovers
    .filter(
      (t) =>
        !/^(date|description|total|balance|particulars)$/i.test(t.description) &&
        !/^opening\s*balance/i.test(t.description)
    );

  if (!transactions.length) {
    throw new Error(
      "CSV was read but no transaction rows were found. Check that Date, Description, and Debit/Credit (or Amount) columns have data."
    );
  }

  const detected = detectCurrency({
    headers,
    rows: parsed.data,
    text: text.slice(0, 8000),
    amountSamples: amountSamples.slice(0, 60),
  });

  return {
    transactions,
    currency: detected.code,
    currencySource: detected.source,
  };
}
