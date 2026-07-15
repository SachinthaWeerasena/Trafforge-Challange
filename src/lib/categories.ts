import type { TransactionCategory } from "./types";

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  income: "Income",
  groceries: "Groceries",
  utilities: "Utilities",
  transport: "Transport",
  dining: "Dining",
  subscriptions: "Subscriptions",
  loan_payments: "Loan Payments",
  fees: "Fees",
  transfers: "Transfers",
  cash_withdrawals: "Cash Withdrawals",
  shopping: "Shopping",
  travel: "Travel",
  healthcare: "Healthcare",
  entertainment: "Entertainment",
  other: "Other",
};

export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  income: "#0f766e",
  groceries: "#15803d",
  utilities: "#0369a1",
  transport: "#c2410c",
  dining: "#be123c",
  subscriptions: "#7c3aed",
  loan_payments: "#4338ca",
  fees: "#a16207",
  transfers: "#475569",
  cash_withdrawals: "#b45309",
  shopping: "#db2777",
  travel: "#0891b2",
  healthcare: "#059669",
  entertainment: "#9333ea",
  other: "#64748b",
};

/** Keyword → category rules. Applied before AI for speed & offline demo reliability. */
export const CATEGORY_RULES: Array<{
  category: TransactionCategory;
  patterns: RegExp[];
}> = [
  {
    category: "income",
    patterns: [
      /salary/i,
      /payroll/i,
      /wage/i,
      /direct\s*deposit/i,
      /interest\s*credit/i,
      /refund/i,
      /dividend/i,
    ],
  },
  {
    category: "groceries",
    patterns: [
      /woolworths/i,
      /coles/i,
      /aldi/i,
      /tesco/i,
      /whole\s*foods/i,
      /trader\s*joe/i,
      /supermarket/i,
      /grocery/i,
      /spar\b/i,
      /keells/i,
      /cargills/i,
    ],
  },
  {
    category: "utilities",
    patterns: [
      /electric/i,
      /electricity/i,
      /water\s*bill/i,
      /gas\s*bill/i,
      /internet/i,
      /broadband/i,
      /utility/i,
      /power\s*co/i,
      /dialog\s*fibre/i,
      /slt\b/i,
    ],
  },
  {
    category: "transport",
    patterns: [
      /\buber\b/i,
      /\blyft\b/i,
      /grab\b/i,
      /pickme/i,
      /fuel/i,
      /petrol/i,
      /shell\b/i,
      /bp\s+fuel/i,
      /parking/i,
      /transit/i,
      /metro\b/i,
      /taxi/i,
    ],
  },
  {
    category: "dining",
    patterns: [
      /restaurant/i,
      /cafe\b/i,
      /coffee/i,
      /starbucks/i,
      /mcdonald/i,
      /kfc\b/i,
      /dominos/i,
      /pizza/i,
      /doordash/i,
      /grubhub/i,
      /deliveroo/i,
      /ubereats/i,
    ],
  },
  {
    category: "subscriptions",
    patterns: [
      /netflix/i,
      /spotify/i,
      /disney\+/i,
      /apple\.com\/bill/i,
      /google\s*play/i,
      /microsoft\s*365/i,
      /adobe/i,
      /subscription/i,
      /prime\s*video/i,
      /youtube\s*premium/i,
    ],
  },
  {
    category: "loan_payments",
    patterns: [
      /loan\s*repay/i,
      /mortgage/i,
      /emi\b/i,
      /installment/i,
      /hire\s*purchase/i,
      /personal\s*loan/i,
      /auto\s*loan/i,
    ],
  },
  {
    category: "fees",
    patterns: [
      /bank\s*fee/i,
      /service\s*charge/i,
      /maintenance\s*fee/i,
      /overdraft/i,
      /late\s*fee/i,
      /atm\s*fee/i,
      /\bfee\b/i,
      /charge\b/i,
    ],
  },
  {
    category: "transfers",
    patterns: [
      /transfer/i,
      /tfr\b/i,
      /zelle/i,
      /venmo/i,
      /paypal/i,
      /wire\s*to/i,
      /fps\b/i,
      /iban/i,
    ],
  },
  {
    category: "cash_withdrawals",
    patterns: [/atm\s*withdraw/i, /cash\s*withdraw/i, /cash\s*wdl/i, /\batm\b/i],
  },
  {
    category: "shopping",
    patterns: [
      /amazon/i,
      /ebay/i,
      /walmart/i,
      /target\b/i,
      /ikea/i,
      /uniqlo/i,
      /zara\b/i,
      /shopify/i,
    ],
  },
  {
    category: "travel",
    patterns: [
      /airline/i,
      /airfare/i,
      /booking\.com/i,
      /airbnb/i,
      /hotel/i,
      /expedia/i,
      /qatar\s*airways/i,
      /emirates/i,
      /sri\s*lankan\s*airlines/i,
    ],
  },
  {
    category: "healthcare",
    patterns: [/pharmacy/i, /hospital/i, /clinic/i, /doctor/i, /dental/i, /cvs\b/i],
  },
  {
    category: "entertainment",
    patterns: [/cinema/i, /movie/i, /concert/i, /steam\b/i, /playstation/i, /xbox/i],
  },
];

export function categorizeByRules(description: string): {
  category: TransactionCategory;
  confidence: number;
} {
  for (const rule of CATEGORY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(description)) {
        return { category: rule.category, confidence: 0.92 };
      }
    }
  }
  return { category: "other", confidence: 0.4 };
}
