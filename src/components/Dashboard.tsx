"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CATEGORY_CHART_COLORS, CATEGORY_LABELS } from "@/lib/categories";
import { formatMoney } from "@/lib/currency";
import type { AnalysisResult } from "@/lib/types";

interface Props {
  analysis: AnalysisResult;
  fileName: string;
  onReset: () => void;
}

/** YYYY-MM → "May 2026" (never truncate to "202"). */
function formatMonthLabel(monthKey: string): string {
  const m = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-US", { month: "short", year: "numeric" });
    }
  }
  return monthKey;
}

/** Compact, readable Y-axis ticks for large LKR amounts. */
function formatAxisAmount(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = abs / 1_000;
    return `${sign}${v >= 100 ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return `${sign}${Math.round(abs)}`;
}

/** Derive a readable bank label from the uploaded file name. */
function bankNameFromFile(fileName: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "Bank statement";
  return base
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function Dashboard({ analysis, fileName, onReset }: Props) {
  const ccy = analysis.currency || "USD";
  const money = (n: number | null | undefined) => formatMoney(n, ccy);
  const bankName = bankNameFromFile(fileName);
  const bonus = analysis.bonus;
  const loan = bonus.loanAffordability ?? {
    monthlyIncomeAvg: analysis.totalIncome,
    monthlyExpenseAvg: analysis.totalExpenses,
    monthlySurplus: analysis.netSavings,
    suggestedMaxInstallment: 0,
    estimatedMaxLoan: 0,
    assumedAprPercent: 12,
    assumedTermMonths: 36,
    comfortLevel: "stretched" as const,
    note: "Re-analyze this statement to refresh the loan affordability estimate.",
  };
  const [txnQuery, setTxnQuery] = useState("");
  const [cashMode, setCashMode] = useState<"monthly" | "yearly">("monthly");

  const savingsBadge = `${analysis.savingsRate >= 0 ? "+" : ""}${analysis.savingsRate.toFixed(1)}%`;

  const cashData = useMemo(() => {
    if (cashMode === "yearly") {
      const byYear = new Map<
        string,
        { net: number; inflow: number; outflow: number }
      >();
      for (const m of analysis.cashFlow) {
        const year = m.month.slice(0, 4) || m.month;
        const prev = byYear.get(year) ?? { net: 0, inflow: 0, outflow: 0 };
        byYear.set(year, {
          net: prev.net + m.net,
          inflow: prev.inflow + m.inflows,
          outflow: prev.outflow + m.outflows,
        });
      }
      const years = [...byYear.entries()];
      return years.map(([year, v], i) => ({
        label: year,
        full: year,
        value: Math.round(v.net),
        inflow: Math.round(v.inflow),
        outflow: Math.round(v.outflow),
        highlight: i === years.length - 1,
      }));
    }

    return analysis.cashFlow.map((m, i, arr) => ({
      label: formatMonthLabel(m.month),
      full: m.month,
      value: Math.round(m.net),
      inflow: Math.round(m.inflows),
      outflow: Math.round(m.outflows),
      highlight: i === arr.length - 1,
    }));
  }, [analysis.cashFlow, cashMode]);

  const yTickWidth = useMemo(() => {
    const peak = Math.max(1, ...cashData.map((d) => Math.abs(d.value)));
    if (peak >= 1_000_000) return 72;
    if (peak >= 100_000) return 64;
    return 56;
  }, [cashData]);

  const filteredTxns = useMemo(() => {
    const q = txnQuery.trim().toLowerCase();
    if (!q) return analysis.transactions;
    return analysis.transactions.filter(
      (t) =>
        t.maskedDescription.toLowerCase().includes(q) ||
        (t.reference ?? "").toLowerCase().includes(q) ||
        CATEGORY_LABELS[t.category].toLowerCase().includes(q) ||
        t.date.includes(q)
    );
  }, [analysis.transactions, txnQuery]);

  const pieData = useMemo(
    () =>
      analysis.topCategories.slice(0, 6).map((c) => ({
        name: CATEGORY_LABELS[c.category],
        value: Math.round(c.total * 100) / 100,
        percent: c.percentOfExpenses,
        count: c.count,
        category: c.category,
      })),
    [analysis.topCategories]
  );

  return (
    <div className="dash">
      <div className="dash-title-row">
        <div>
          <h1 className="dash-title">Overview</h1>
          <p className="dash-sub">
            {bankName} · Account {analysis.accountMask}
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onReset}>
          New upload
        </button>
      </div>

      <section className="overview-grid" id="metrics" aria-label="Account overview">
        <article className="metric-card metric-hero">
          <div className="metric-icon" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <path d="M3 10h18" />
            </svg>
          </div>
          <p className="metric-label">Closing balance</p>
          <p className="metric-value mono-num">{money(analysis.closingBalance)}</p>
          <span className="metric-badge">{savingsBadge} savings</span>
          <a className="metric-foot" href="#summary">
            See details
            <span aria-hidden>→</span>
          </a>
        </article>

        <article className="metric-card">
          <div className="metric-icon soft" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3v18M7 8h7a3 3 0 010 6H9" strokeLinecap="round" />
            </svg>
          </div>
          <p className="metric-label">Income</p>
          <p className="metric-value mono-num">{money(analysis.totalIncome)}</p>
          <span className="metric-badge pos">Inflows</span>
          <a className="metric-foot" href="#spend">
            See details
            <span aria-hidden>→</span>
          </a>
        </article>

        <article className="metric-card">
          <div className="metric-icon soft" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path
                d="M4 19V5m0 14l4-5 4 3 4-7 4 4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="metric-label">Expenses</p>
          <p className="metric-value mono-num">{money(analysis.totalExpenses)}</p>
          <span className="metric-badge mute">Outflows</span>
          <a className="metric-foot" href="#transactions">
            See details
            <span aria-hidden>→</span>
          </a>
        </article>
      </section>

      <section className="finn-banner insight-card" id="summary">
        <p className="finn-label">Finn noticed</p>
        <p className="finn-banner-text">{analysis.naturalLanguageSummary}</p>
      </section>

      <div className="mid-grid" id="spend">
        <section className="panel-card">
          <header className="panel-card-head">
            <div>
              <h2>Top categories</h2>
              <p>Share of expenses this period</p>
            </div>
          </header>
          {pieData.length === 0 ? (
            <p className="muted">No category breakdown yet.</p>
          ) : (
            <div className="category-pie">
              <div className="chart-box category-pie-chart" aria-hidden={false}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={pieData.length > 1 ? 2 : 0}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    >
                      {pieData.map((d) => (
                        <Cell
                          key={d.category}
                          fill={CATEGORY_CHART_COLORS[d.category]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, item) => {
                        const row = item?.payload as (typeof pieData)[0] | undefined;
                        const amount = money(Number(value));
                        const pct = row ? `${row.percent.toFixed(0)}%` : "";
                        return [`${amount} · ${pct}`, row?.name ?? "Category"];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="cat-legend">
                {pieData.map((c) => (
                  <li key={c.category}>
                    <span
                      className="swatch"
                      style={{ background: CATEGORY_CHART_COLORS[c.category] }}
                      aria-hidden
                    />
                    <div className="cat-legend-meta">
                      <strong>{c.name}</strong>
                      <span>
                        {c.count} txn{c.count === 1 ? "" : "s"} · {c.percent.toFixed(0)}%
                      </span>
                    </div>
                    <em className="mono-num">{money(c.value)}</em>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel-card">
          <header className="panel-card-head">
            <div>
              <h2>Cash flow</h2>
              <p>{cashMode === "monthly" ? "Net by month" : "Net by year"}</p>
            </div>
            <div className="seg-toggle" role="group" aria-label="Cash flow period">
              <button
                type="button"
                className={cashMode === "monthly" ? "on" : ""}
                onClick={() => setCashMode("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={cashMode === "yearly" ? "on" : ""}
                onClick={() => setCashMode("yearly")}
              >
                Yearly
              </button>
            </div>
          </header>
          <div className="chart-box tall cashflow-chart">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={cashData}
                barCategoryGap="28%"
                margin={{ top: 16, right: 16, left: 8, bottom: 12 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(157,181,177,0.25)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  interval={0}
                  tick={{ fontSize: 12, fill: "#6B7280", fontWeight: 600 }}
                  tickMargin={10}
                  height={40}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  width={yTickWidth}
                  tick={{ fontSize: 12, fill: "#6B7280", fontWeight: 500 }}
                  tickFormatter={formatAxisAmount}
                  tickMargin={8}
                  axisLine={false}
                  tickLine={false}
                  domain={[
                    (dataMin: number) =>
                      dataMin < 0 ? Math.floor(dataMin * 1.08) : 0,
                    (dataMax: number) =>
                      dataMax > 0 ? Math.ceil(dataMax * 1.08) : 0,
                  ]}
                />
                <Tooltip
                  cursor={{ fill: "rgba(13,131,119,0.06)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload as (typeof cashData)[0];
                    return (
                      <div className="chart-tooltip">
                        <p>{d.label}</p>
                        <p>
                          <span>Net</span>
                          <strong className="mono-num">{money(d.value)}</strong>
                        </p>
                        <p>
                          <span>Inflow</span>
                          <strong className="mono-num">{money(d.inflow)}</strong>
                        </p>
                        <p>
                          <span>Outflow</span>
                          <strong className="mono-num">{money(d.outflow)}</strong>
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {cashData.map((d) => (
                    <Cell
                      key={d.full}
                      fill={
                        d.value < 0
                          ? "#94A3B8"
                          : d.highlight
                            ? "url(#barFill)"
                            : "#14B8A6"
                      }
                    />
                  ))}
                </Bar>
                <defs>
                  <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14B8A6" />
                    <stop offset="100%" stopColor="#0A6359" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {(analysis.aiCoachTips.length > 0 || analysis.bonus.aiAnomalyInsight) && (
        <section className="panel-card" id="coach">
          <header className="panel-card-head">
            <div>
              <p className="finn-label">Finn noticed</p>
              <h2>Coach tips</h2>
              <p>Grounded ideas from this statement</p>
            </div>
          </header>
          {analysis.bonus.aiAnomalyInsight && (
            <p className="insight-lead">{analysis.bonus.aiAnomalyInsight}</p>
          )}
          {analysis.aiCoachTips.length > 0 && (
            <ol className="coach-list compact">
              {analysis.aiCoachTips.map((tip, i) => (
                <li key={i} data-n={i + 1}>
                  {tip}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="panel-card" id="alerts">
        <header className="panel-card-head">
          <div>
            <h2>Insights</h2>
            <p>Alerts and estimates computed from this statement</p>
          </div>
        </header>
        <div className="bonus-grid bonus-grid-full">
          <article className="bonus-tile">
            <h4>Duplicate charge detection</h4>
            {bonus.duplicateCharges.length === 0 ? (
              <p className="muted">No near-duplicate charges detected.</p>
            ) : (
              <ul>
                {bonus.duplicateCharges.map((d, i) => (
                  <li key={i}>
                    {d.description}: {money(d.amount)} on {d.dates.join(" & ")}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="bonus-tile">
            <h4>Hidden bank fees</h4>
            {bonus.hiddenFees.length === 0 ? (
              <p className="muted">No fee-like items flagged.</p>
            ) : (
              <ul>
                {bonus.hiddenFees.map((t) => (
                  <li key={t.id}>
                    {t.maskedDescription}: {money(t.debit)} · {t.date}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="bonus-tile">
            <h4>Failed or returned transactions</h4>
            {bonus.failedTransactions.length === 0 ? (
              <p className="muted">No failed/returned transactions flagged.</p>
            ) : (
              <ul>
                {bonus.failedTransactions.map((t) => (
                  <li key={t.id}>
                    {t.maskedDescription}: {money(t.debit ?? t.credit)} · {t.date}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="bonus-tile">
            <h4>Salary consistency</h4>
            <p>{bonus.salaryConsistency.note}</p>
            {bonus.salaryConsistency.amounts.length > 0 && (
              <p className="muted mono-num">
                Credits:{" "}
                {bonus.salaryConsistency.amounts.map((a) => money(a)).join(" · ")}
              </p>
            )}
          </article>

          <article className="bonus-tile">
            <h4>Cash-heavy behaviour</h4>
            <p>
              {bonus.cashHeavy.cashPctOfExpenses}% of expenses · {bonus.cashHeavy.note}
            </p>
            {bonus.cashHeavy.flagged && <p className="bonus-flag">Alert flagged</p>}
          </article>

          <article className="bonus-tile">
            <h4>Loan affordability estimate</h4>
            <p>{loan.note}</p>
            <ul className="loan-metrics">
              <li>
                <span>Avg monthly income</span>
                <em className="mono-num">{money(loan.monthlyIncomeAvg)}</em>
              </li>
              <li>
                <span>Avg monthly expenses</span>
                <em className="mono-num">{money(loan.monthlyExpenseAvg)}</em>
              </li>
              <li>
                <span>Monthly surplus</span>
                <em className="mono-num">{money(loan.monthlySurplus)}</em>
              </li>
              <li>
                <span>Suggested max installment</span>
                <em className="mono-num">{money(loan.suggestedMaxInstallment)}</em>
              </li>
              <li>
                <span>
                  Est. max loan ({loan.assumedTermMonths} mo @ {loan.assumedAprPercent}% APR)
                </span>
                <em className="mono-num">{money(loan.estimatedMaxLoan)}</em>
              </li>
              <li>
                <span>Comfort</span>
                <em className={`comfort-${loan.comfortLevel}`}>{loan.comfortLevel}</em>
              </li>
            </ul>
          </article>

          <article className="bonus-tile span-2">
            <h4>Personalised saving suggestions</h4>
            <ul>
              {bonus.savingSuggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="panel-card" id="transactions">
        <header className="panel-card-head table-head">
          <div>
            <h2>Recent activities</h2>
            <p>Masked descriptions · categorized spend</p>
          </div>
          <div className="table-tools">
            <label className="table-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                value={txnQuery}
                onChange={(e) => setTxnQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search transactions"
              />
            </label>
            <button type="button" className="btn-secondary sm" onClick={() => setTxnQuery("")}>
              Clear
            </button>
          </div>
        </header>

        <div className="table-wrap modern">
          <table>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Ref</th>
                <th>Date</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {filteredTxns.slice(0, 40).map((t) => {
                const isCredit = t.credit != null;
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="activity-cell">
                        <span
                          className="activity-icon"
                          style={{
                            background: CATEGORY_CHART_COLORS[t.category],
                          }}
                          aria-hidden
                        >
                          {CATEGORY_LABELS[t.category].slice(0, 1)}
                        </span>
                        <div>
                          <strong>{t.maskedDescription}</strong>
                        </div>
                      </div>
                    </td>
                    <td className="mono-num">{t.reference ?? "—"}</td>
                    <td className="mono-num">{t.date}</td>
                    <td
                      className={`mono-num ${t.category === "fees" ? "amount-danger" : ""}`}
                    >
                      {t.debit != null ? money(t.debit) : "—"}
                    </td>
                    <td className={`mono-num ${isCredit ? "pos" : ""}`}>
                      {t.credit != null ? money(t.credit) : "—"}
                    </td>
                    <td>
                      <span
                        className={`pill ${t.category === "income" ? "income" : ""}`}
                        data-cat={t.category}
                      >
                        {CATEGORY_LABELS[t.category]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredTxns.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-row">
                    No transactions match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredTxns.length > 40 && (
          <p className="table-note muted">
            Showing 40 of {filteredTxns.length} — refine search to narrow results.
          </p>
        )}
      </section>
    </div>
  );
}
