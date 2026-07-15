import Papa from "papaparse";
import { detectCurrency, stripCurrencyNoise } from "./currency";
import type { RawTransaction } from "./types";

const FIELD_ALIASES: Record<keyof Omit<RawTransaction, never>, string[]> = {
  date: ["date", "txn date", "transaction date", "trans date", "value date", "posted"],
  description: [
    "description",
    "narration",
    "details",
    "particulars",
    "merchant",
    "payee",
    "memo",
  ],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "out", "expense", "dr"],
  credit: ["credit", "deposit", "deposits", "money in", "in", "income", "cr"],
  balance: ["balance", "running balance", "available balance", "bal"],
  reference: ["reference", "ref", "ref no", "transaction id", "txn id", "cheque"],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, " ");
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
  return map;
}

function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let raw = String(value).trim();
  raw = stripCurrencyNoise(raw);
  raw = raw.replace(/[, ]/g, "").replace(/[()]/g, (c) => (c === "(" ? "-" : ""));
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: unknown): string {
  if (!value) return "";
  const s = String(value).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, "0");
    const month = m[2].padStart(2, "0");
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${month}-${day}`;
  }
  return s;
}

export interface ParsedCsvStatement {
  transactions: RawTransaction[];
  currency: string;
  currencySource: string;
}

export function parseCsvStatement(csvText: string): ParsedCsvStatement {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length && !parsed.data.length) {
    throw new Error(`CSV parse failed: ${parsed.errors[0]?.message ?? "unknown error"}`);
  }

  const headers = parsed.meta.fields ?? Object.keys(parsed.data[0] ?? {});
  const map = mapHeaders(headers);

  if (!map.date || !map.description) {
    throw new Error(
      "CSV must include at least Date and Description columns (aliases supported)."
    );
  }

  const amountHeader = headers.find((h) =>
    ["amount", "txn amount", "transaction amount"].includes(normalizeHeader(h))
  );
  const typeHeader = headers.find((h) =>
    ["type", "dr/cr", "transaction type"].includes(normalizeHeader(h))
  );

  const amountSamples: string[] = [];
  const transactions = parsed.data
    .map((row) => {
      let debit = map.debit ? parseAmount(row[map.debit]) : null;
      let credit = map.credit ? parseAmount(row[map.credit]) : null;

      if (map.debit && row[map.debit]) amountSamples.push(String(row[map.debit]));
      if (map.credit && row[map.credit]) amountSamples.push(String(row[map.credit]));
      if (amountHeader && row[amountHeader]) amountSamples.push(String(row[amountHeader]));

      if (amountHeader && (debit === null || credit === null)) {
        const amt = parseAmount(row[amountHeader]);
        if (amt !== null) {
          const type = typeHeader ? String(row[typeHeader] ?? "").toLowerCase() : "";
          if (type.includes("cr") || type.includes("credit") || type.includes("in")) {
            credit = Math.abs(amt);
            debit = null;
          } else if (amt < 0) {
            debit = Math.abs(amt);
            credit = null;
          } else if (type.includes("dr") || type.includes("debit") || type.includes("out")) {
            debit = Math.abs(amt);
            credit = null;
          } else {
            debit = Math.abs(amt);
            credit = null;
          }
        }
      }

      return {
        date: parseDate(row[map.date!]),
        description: String(row[map.description!] ?? "").trim(),
        debit,
        credit,
        balance: map.balance ? parseAmount(row[map.balance]) : null,
        reference: map.reference ? String(row[map.reference] ?? "").trim() || null : null,
      } satisfies RawTransaction;
    })
    .filter((t) => t.date && t.description);

  const detected = detectCurrency({
    headers,
    rows: parsed.data,
    text: csvText.slice(0, 8000),
    amountSamples: amountSamples.slice(0, 60),
  });

  return {
    transactions,
    currency: detected.code,
    currencySource: detected.source,
  };
}
