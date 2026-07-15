import { format, parseISO, startOfMonth } from "date-fns";
import { categorizeByRules } from "./categories";
import { formatMoney } from "./currency";
import { maskDescription } from "./privacy";
import type {
  AnalysisResult,
  BonusAlerts,
  CategoryBreakdown,
  MonthlyCashFlow,
  RawTransaction,
  RecurringPayment,
  Transaction,
  TransactionCategory,
  UnusualSpike,
} from "./types";

function uid(): string {
  return `txn_${Math.random().toString(36).slice(2, 10)}`;
}

export function enrichTransactions(
  raw: RawTransaction[],
  aiCategories?: Map<string, TransactionCategory>
): Transaction[] {
  return raw.map((r, i) => {
    const key = `${r.date}|${r.description}`;
    const rule = categorizeByRules(r.description);
    const aiCat = aiCategories?.get(key);
    // AI wins when provided (batch categorize / unknowns); else rules
    const category = aiCat ?? rule.category;
    const amount = (r.credit ?? 0) - (r.debit ?? 0);
    return {
      ...r,
      id: uid() + i,
      category,
      categoryConfidence: aiCat ? 0.9 : rule.confidence,
      categorySource: aiCat ? "ai" : "rules",
      amount,
      maskedDescription: maskDescription(r.description),
    };
  });
}

function normalizeMerchant(description: string): string {
  return description
    .replace(/\d+/g, "")
    .replace(/[^a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 40);
}

export function computeInsights(
  transactions: Transaction[],
  accountMask: string,
  naturalLanguageSummary: string,
  aiUsed: boolean,
  currency: string = "USD",
  currencySource: string = "default"
): AnalysisResult {
  const incomeTx = transactions.filter((t) => t.credit && t.credit > 0);
  const expenseTx = transactions.filter((t) => t.debit && t.debit > 0);

  const totalIncome = incomeTx.reduce((s, t) => s + (t.credit ?? 0), 0);
  const totalExpenses = expenseTx.reduce((s, t) => s + (t.debit ?? 0), 0);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

  const byCat = new Map<TransactionCategory, { total: number; count: number }>();
  for (const t of expenseTx) {
    const cur = byCat.get(t.category) ?? { total: 0, count: 0 };
    cur.total += t.debit ?? 0;
    cur.count += 1;
    byCat.set(t.category, cur);
  }

  const topCategories: CategoryBreakdown[] = Array.from(byCat.entries())
    .map(([category, v]) => ({
      category,
      total: v.total,
      count: v.count,
      percentOfExpenses: totalExpenses > 0 ? (v.total / totalExpenses) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const biggestTransactions = [...expenseTx]
    .sort((a, b) => (b.debit ?? 0) - (a.debit ?? 0))
    .slice(0, 5);

  const recurringPayments = findRecurring(expenseTx);
  const unusualSpikes = findSpikes(expenseTx);
  const cashFlow = buildCashFlow(transactions);

  const withBalance = transactions.filter((t) => t.balance !== null);
  const openingBalance = withBalance[0]?.balance ?? null;
  const closingBalance = withBalance[withBalance.length - 1]?.balance ?? null;

  const bonus = buildBonus(transactions, expenseTx, incomeTx, totalExpenses);

  return {
    transactions,
    totalIncome,
    totalExpenses,
    netSavings,
    savingsRate,
    topCategories,
    biggestTransactions,
    recurringPayments,
    unusualSpikes,
    cashFlow,
    openingBalance,
    closingBalance,
    naturalLanguageSummary,
    aiCoachTips: [],
    bonus,
    accountMask,
    analyzedAt: new Date().toISOString(),
    aiUsed,
    aiProvider: null,
    aiFeatures: [],
    currency,
    currencySource,
  };
}

function findRecurring(expenses: Transaction[]): RecurringPayment[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of expenses) {
    const key = normalizeMerchant(t.maskedDescription);
    if (key.length < 3) continue;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const recurring: RecurringPayment[] = [];
  for (const [, txns] of Array.from(groups.entries())) {
    if (txns.length < 2) continue;
    const amounts = txns.map((t) => t.debit ?? 0);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((s, a) => s + Math.abs(a - avg), 0) / amounts.length;
    if (variance / (avg || 1) > 0.25) continue;
    recurring.push({
      merchant: txns[0].maskedDescription.slice(0, 48),
      category: txns[0].category,
      averageAmount: Math.round(avg * 100) / 100,
      frequency: txns.length >= 3 ? "monthly-ish" : "repeated",
      occurrences: txns.length,
    });
  }
  return recurring.sort((a, b) => b.occurrences - a.occurrences).slice(0, 8);
}

function findSpikes(expenses: Transaction[]): UnusualSpike[] {
  if (expenses.length < 3) return [];
  const amounts = expenses.map((t) => t.debit ?? 0);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const std = Math.sqrt(
    amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length
  );
  const threshold = mean + 2 * (std || mean);
  return expenses
    .filter((t) => (t.debit ?? 0) >= threshold && (t.debit ?? 0) > mean * 1.5)
    .slice(0, 5)
    .map((t) => ({
      date: t.date,
      description: t.maskedDescription,
      amount: t.debit ?? 0,
      category: t.category,
      reason: `≈${((t.debit ?? 0) / (mean || 1)).toFixed(1)}× average spend`,
    }));
}

function buildCashFlow(transactions: Transaction[]): MonthlyCashFlow[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const months = new Map<string, Transaction[]>();
  for (const t of sorted) {
    let monthKey = t.date.slice(0, 7);
    try {
      monthKey = format(startOfMonth(parseISO(t.date)), "yyyy-MM");
    } catch {
      /* keep slice */
    }
    const arr = months.get(monthKey) ?? [];
    arr.push(t);
    months.set(monthKey, arr);
  }

  return Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, txns]) => {
      const inflows = txns.reduce((s, t) => s + (t.credit ?? 0), 0);
      const outflows = txns.reduce((s, t) => s + (t.debit ?? 0), 0);
      const withBal = txns.filter((t) => t.balance !== null);
      return {
        month,
        openingBalance: withBal[0]?.balance ?? null,
        closingBalance: withBal[withBal.length - 1]?.balance ?? null,
        inflows,
        outflows,
        net: inflows - outflows,
      };
    });
}

function buildBonus(
  all: Transaction[],
  expenses: Transaction[],
  income: Transaction[],
  totalExpenses: number
): BonusAlerts {
  // Duplicate charges: same amount + similar description within 3 days
  const duplicateCharges: BonusAlerts["duplicateCharges"] = [];
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if ((a.debit ?? 0) !== (b.debit ?? 0) || !a.debit) continue;
      const sameMerchant =
        normalizeMerchant(a.description) === normalizeMerchant(b.description);
      const dayDiff = Math.abs(
        (new Date(a.date).getTime() - new Date(b.date).getTime()) / 86400000
      );
      if (sameMerchant && dayDiff <= 3) {
        duplicateCharges.push({
          description: a.maskedDescription,
          amount: a.debit!,
          dates: [a.date, b.date],
        });
      }
    }
  }

  const hiddenFees = expenses.filter(
    (t) => t.category === "fees" || /fee|charge|levy/i.test(t.description)
  );

  const failedTransactions = all.filter((t) =>
    /fail|declined|reversed|nsf|insufficient/i.test(t.description)
  );

  const salaryLike = income.filter((t) => /salary|payroll|wage/i.test(t.description));
  const salaryAmounts = salaryLike.map((t) => t.credit ?? 0);
  let salaryNote = "No clear salary pattern detected.";
  let detected = false;
  if (salaryAmounts.length >= 2) {
    detected = true;
    const avg = salaryAmounts.reduce((a, b) => a + b, 0) / salaryAmounts.length;
    const maxDev = Math.max(...salaryAmounts.map((a) => Math.abs(a - avg) / avg));
    salaryNote =
      maxDev <= 0.05
        ? `Salary looks consistent (~${Math.round(avg)}).`
        : `Salary varies up to ${(maxDev * 100).toFixed(0)}% — review income stability.`;
  }

  const cashTotal = expenses
    .filter((t) => t.category === "cash_withdrawals")
    .reduce((s, t) => s + (t.debit ?? 0), 0);
  const cashPct = totalExpenses > 0 ? (cashTotal / totalExpenses) * 100 : 0;

  const savingSuggestions: string[] = [];
  if (cashPct > 15) {
    savingSuggestions.push(
      "High cash usage — consider card/digital payments for clearer budgeting."
    );
  }
  const dining = expenses
    .filter((t) => t.category === "dining")
    .reduce((s, t) => s + (t.debit ?? 0), 0);
  if (totalExpenses > 0 && dining / totalExpenses > 0.15) {
    savingSuggestions.push(
      "Dining is a large share of spend — set a weekly dining budget."
    );
  }
  const subs = expenses.filter((t) => t.category === "subscriptions");
  if (subs.length >= 3) {
    savingSuggestions.push(
      `You have ${subs.length} subscription-like payments — audit unused ones.`
    );
  }
  if (!savingSuggestions.length) {
    savingSuggestions.push(
      "Automate a transfer to savings on payday to lock in a savings habit."
    );
  }

  return {
    duplicateCharges: duplicateCharges.slice(0, 5),
    hiddenFees: hiddenFees.slice(0, 8),
    failedTransactions: failedTransactions.slice(0, 5),
    salaryConsistency: { detected, amounts: salaryAmounts, note: salaryNote },
    cashHeavy: {
      flagged: cashPct > 20,
      cashPctOfExpenses: Math.round(cashPct * 10) / 10,
      note:
        cashPct > 20
          ? "Cash-heavy behavior detected."
          : "Cash withdrawals are within a moderate range.",
    },
    savingSuggestions,
  };
}

export function buildDeterministicSummary(
  result: Omit<AnalysisResult, "naturalLanguageSummary">
): string {
  const top = result.topCategories[0];
  const months = result.cashFlow;
  const money = (n: number) =>
    formatMoney(n, result.currency, { maximumFractionDigits: 0 });
  let trend = "";
  if (months.length >= 2) {
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    if (prev.outflows > 0) {
      const pct = ((last.outflows - prev.outflows) / prev.outflows) * 100;
      const dir = pct >= 0 ? "increased" : "decreased";
      trend = ` Spending ${dir} ${Math.abs(pct).toFixed(0)}% month-over-month`;
      if (top) trend += `, mainly driven by ${top.category.replace(/_/g, " ")}`;
      trend += ".";
    }
  }
  return (
    `Over this statement period you earned ${money(result.totalIncome)} and spent ${money(result.totalExpenses)}, ` +
    `for a net of ${money(result.netSavings)} (savings rate ${result.savingsRate.toFixed(1)}%).` +
    (top
      ? ` Top expense category: ${top.category.replace(/_/g, " ")} (${money(top.total)}, ${top.percentOfExpenses.toFixed(0)}% of expenses).`
      : "") +
    trend
  );
}
