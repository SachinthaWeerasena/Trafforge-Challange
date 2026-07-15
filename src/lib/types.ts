export type TransactionCategory =
  | "income"
  | "groceries"
  | "utilities"
  | "transport"
  | "dining"
  | "subscriptions"
  | "loan_payments"
  | "fees"
  | "transfers"
  | "cash_withdrawals"
  | "shopping"
  | "travel"
  | "healthcare"
  | "entertainment"
  | "other";

export interface RawTransaction {
  date: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  reference: string | null;
}

export interface Transaction extends RawTransaction {
  id: string;
  category: TransactionCategory;
  categoryConfidence: number;
  categorySource: "rules" | "ai";
  amount: number;
  maskedDescription: string;
}

export interface CategoryBreakdown {
  category: TransactionCategory;
  total: number;
  count: number;
  percentOfExpenses: number;
}

export interface MonthlyCashFlow {
  month: string;
  openingBalance: number | null;
  closingBalance: number | null;
  inflows: number;
  outflows: number;
  net: number;
}

export interface RecurringPayment {
  merchant: string;
  category: TransactionCategory;
  averageAmount: number;
  frequency: string;
  occurrences: number;
}

export interface UnusualSpike {
  date: string;
  description: string;
  amount: number;
  category: TransactionCategory;
  reason: string;
}

export interface BonusAlerts {
  duplicateCharges: Array<{ description: string; amount: number; dates: string[] }>;
  hiddenFees: Transaction[];
  failedTransactions: Transaction[];
  salaryConsistency: {
    detected: boolean;
    amounts: number[];
    note: string;
  };
  cashHeavy: {
    flagged: boolean;
    cashPctOfExpenses: number;
    note: string;
  };
  savingSuggestions: string[];
  /** AI plain-English explanation of anomalies / fees / cash patterns */
  aiAnomalyInsight?: string;
}

export interface AnalysisResult {
  transactions: Transaction[];
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number;
  topCategories: CategoryBreakdown[];
  biggestTransactions: Transaction[];
  recurringPayments: RecurringPayment[];
  unusualSpikes: UnusualSpike[];
  cashFlow: MonthlyCashFlow[];
  openingBalance: number | null;
  closingBalance: number | null;
  naturalLanguageSummary: string;
  /** Free AI coach tips (when provider configured) */
  aiCoachTips: string[];
  bonus: BonusAlerts;
  accountMask: string;
  analyzedAt: string;
  aiUsed: boolean;
  aiProvider: string | null;
  aiFeatures: string[];
  /** ISO 4217 code detected from the statement (e.g. USD, LKR, EUR) */
  currency: string;
  currencySource: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
