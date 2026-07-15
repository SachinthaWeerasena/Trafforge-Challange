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

  const bonus = buildBonus(
    transactions,
    expenseTx,
    incomeTx,
    totalIncome,
    totalExpenses,
    cashFlow.length || 1
  );

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
  totalIncome: number,
  totalExpenses: number,
  monthCount: number
): BonusAlerts {
  const months = Math.max(1, monthCount);

  // Duplicate charges: same amount + similar description within 3 days
  const duplicateCharges: BonusAlerts["duplicateCharges"] = [];
  const dupKeys = new Set<string>();
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if ((a.debit ?? 0) !== (b.debit ?? 0) || !a.debit) continue;
      const merchant = normalizeMerchant(a.description);
      const sameMerchant = merchant === normalizeMerchant(b.description);
      const dayDiff = Math.abs(
        (new Date(a.date).getTime() - new Date(b.date).getTime()) / 86400000
      );
      if (sameMerchant && dayDiff <= 3) {
        const key = `${merchant}|${a.debit}|${[a.date, b.date].sort().join(",")}`;
        if (dupKeys.has(key)) continue;
        dupKeys.add(key);
        duplicateCharges.push({
          description: a.maskedDescription,
          amount: a.debit!,
          dates: [a.date, b.date].sort(),
        });
      }
    }
  }

  // Hidden bank fees
  const hiddenFees = expenses.filter(
    (t) =>
      t.category === "fees" ||
      /\b(fee|charge|levy|commission|service\s*charge|maintenance|overdraft)\b/i.test(
        t.description
      )
  );

  // Failed / returned transactions
  const failedTransactions = all.filter((t) =>
    /\b(fail|failed|declin|reversed?|nsf|insufficient|return(?:ed)?|bounce|unpaid|reject|charge\s*back|cancel(?:led)?|disregard)\b/i.test(
      t.description
    )
  );

  // Salary consistency
  const salaryLike = income.filter((t) =>
    /salary|payroll|wage|direct\s*deposit|payslip/i.test(t.description)
  );
  const salaryAmounts = salaryLike.map((t) => t.credit ?? 0);
  let salaryNote = "No clear salary pattern detected in this period.";
  let detected = false;
  if (salaryAmounts.length >= 2) {
    detected = true;
    const avg = salaryAmounts.reduce((a, b) => a + b, 0) / salaryAmounts.length;
    const maxDev = Math.max(...salaryAmounts.map((a) => Math.abs(a - avg) / (avg || 1)));
    salaryNote =
      maxDev <= 0.05
        ? `Salary looks consistent across ${salaryAmounts.length} credits (~avg detected).`
        : `Salary varies up to ${(maxDev * 100).toFixed(0)}% across ${salaryAmounts.length} credits — review income stability.`;
  } else if (salaryAmounts.length === 1) {
    detected = true;
    salaryNote = "One salary-like credit found — need another cycle to judge consistency.";
  }

  // Cash-heavy behaviour
  const cashTotal = expenses
    .filter(
      (t) =>
        t.category === "cash_withdrawals" ||
        /\b(atm|cash\s*w\/?d|cash\s*withdraw(?:al)?s?|withdraw(?:al)?s?)\b/i.test(
          t.description
        )
    )
    .reduce((s, t) => s + (t.debit ?? 0), 0);
  const cashPct = totalExpenses > 0 ? (cashTotal / totalExpenses) * 100 : 0;

  // Loan affordability (hypothetical): max installment from surplus & income
  const monthlyIncomeAvg = totalIncome / months;
  const monthlyExpenseAvg = totalExpenses / months;
  const monthlySurplus = monthlyIncomeAvg - monthlyExpenseAvg;
  const fromIncomeCap = monthlyIncomeAvg * 0.3;
  const fromSurplusCap = Math.max(0, monthlySurplus * 0.7);
  const pmt =
    monthlySurplus > 0
      ? Math.min(fromIncomeCap, Math.max(fromSurplusCap, monthlySurplus * 0.5))
      : Math.max(0, monthlyIncomeAvg * 0.15);
  const suggestedPmt = Math.round(Math.max(0, pmt));
  const assumedAprPercent = 12;
  const assumedTermMonths = 36;
  const monthlyRate = assumedAprPercent / 100 / 12;
  const estimatedMaxLoan =
    suggestedPmt > 0 && monthlyRate > 0
      ? Math.round(
          (suggestedPmt * (1 - Math.pow(1 + monthlyRate, -assumedTermMonths))) / monthlyRate
        )
      : 0;

  let comfortLevel: BonusAlerts["loanAffordability"]["comfortLevel"] = "stretched";
  if (monthlySurplus > monthlyIncomeAvg * 0.2 && suggestedPmt > 0) comfortLevel = "comfortable";
  else if (monthlySurplus > 0 && suggestedPmt > 0) comfortLevel = "tight";

  const loanNote =
    suggestedPmt <= 0
      ? "Expenses meet or exceed income this period — a new loan installment would stretch affordability."
      : `Based on this statement, a hypothetical installment up to the suggested max (~${assumedTermMonths} mo @ ${assumedAprPercent}% APR) keeps debt service within a cautious share of income.`;

  // Personalised saving suggestions
  const savingSuggestions: string[] = [];
  if (cashPct > 15) {
    savingSuggestions.push(
      "High cash usage — prefer card/digital payments so spend is easier to track and cut."
    );
  }
  const dining = expenses
    .filter((t) => t.category === "dining")
    .reduce((s, t) => s + (t.debit ?? 0), 0);
  if (totalExpenses > 0 && dining / totalExpenses > 0.12) {
    savingSuggestions.push(
      "Dining is a large share of spend — set a weekly dining cap and track against it."
    );
  }
  const subs = expenses.filter((t) => t.category === "subscriptions");
  if (subs.length >= 2) {
    savingSuggestions.push(
      `You have ${subs.length} subscription-like payments — cancel unused ones and reclaim that monthly amount.`
    );
  }
  if (hiddenFees.length > 0) {
    savingSuggestions.push(
      `Bank fee-like items appear ${hiddenFees.length}× — ask your bank about fee-free options or package changes.`
    );
  }
  if (monthlySurplus > 0) {
    const autoSave = Math.round(monthlySurplus * 0.2);
    if (autoSave > 0) {
      savingSuggestions.push(
        `Automate a transfer of about 20% of monthly surplus on payday to lock in savings.`
      );
    }
  } else {
    savingSuggestions.push(
      "Start by freezing one discretionary category for 30 days and redirect that amount to savings."
    );
  }
  if (!savingSuggestions.length) {
    savingSuggestions.push(
      "Automate a transfer to savings on payday to lock in a savings habit."
    );
  }

  return {
    duplicateCharges: duplicateCharges.slice(0, 8),
    hiddenFees: hiddenFees.slice(0, 10),
    failedTransactions: failedTransactions.slice(0, 8),
    salaryConsistency: { detected, amounts: salaryAmounts, note: salaryNote },
    cashHeavy: {
      flagged: cashPct > 20,
      cashPctOfExpenses: Math.round(cashPct * 10) / 10,
      note:
        cashPct > 20
          ? "Cash-heavy behaviour flagged — a large share of expenses left via cash/ATM."
          : "Cash withdrawals are within a moderate range of expenses.",
    },
    loanAffordability: {
      monthlyIncomeAvg: Math.round(monthlyIncomeAvg * 100) / 100,
      monthlyExpenseAvg: Math.round(monthlyExpenseAvg * 100) / 100,
      monthlySurplus: Math.round(monthlySurplus * 100) / 100,
      suggestedMaxInstallment: suggestedPmt,
      estimatedMaxLoan,
      assumedAprPercent,
      assumedTermMonths,
      comfortLevel,
      note: loanNote,
    },
    savingSuggestions: savingSuggestions.slice(0, 5),
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
