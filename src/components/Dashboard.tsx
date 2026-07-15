"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  const [txnQuery, setTxnQuery] = useState("");
  const [cashMode, setCashMode] = useState<"monthly" | "yearly">("monthly");

  const savingsBadge = `${analysis.savingsRate >= 0 ? "+" : ""}${analysis.savingsRate.toFixed(1)}%`;

  const cashData = useMemo(() => {
    const rows = analysis.cashFlow.map((m, i, arr) => ({
      month: m.month.slice(0, 3),
      full: m.month,
      value: Math.round(cashMode === "monthly" ? m.net : m.inflows),
      inflow: Math.round(m.inflows),
      outflow: Math.round(m.outflows),
      highlight: i === arr.length - 1,
    }));
    return rows;
  }, [analysis.cashFlow, cashMode]);

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

  const topCats = analysis.topCategories.slice(0, 4);

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
          <ul className="wallet-list">
            {topCats.map((c) => (
              <li key={c.category}>
                <span
                  className="wallet-flag"
                  style={{ background: CATEGORY_CHART_COLORS[c.category] }}
                  aria-hidden
                >
                  {CATEGORY_LABELS[c.category].slice(0, 1)}
                </span>
                <div className="wallet-meta">
                  <strong>{CATEGORY_LABELS[c.category]}</strong>
                  <span>{c.count} transactions</span>
                </div>
                <div className="wallet-amounts">
                  <em className="mono-num">{money(c.total)}</em>
                  <span>{c.percentOfExpenses.toFixed(0)}% of spend</span>
                </div>
                <span className={`status-pill ${c.category === "income" ? "active" : ""}`}>
                  {c.category === "income" ? "Income" : "Active"}
                </span>
              </li>
            ))}
            {topCats.length === 0 && (
              <li className="wallet-empty">No category breakdown yet.</li>
            )}
          </ul>
        </section>

        <section className="panel-card">
          <header className="panel-card-head">
            <div>
              <h2>Cash flow</h2>
              <p>{cashMode === "monthly" ? "Net by month" : "Inflows by month"}</p>
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
          <div className="chart-box tall">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={cashData} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(157,181,177,0.2)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#9DB5B1" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#9DB5B1" }} width={48} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(13,131,119,0.06)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload as (typeof cashData)[0];
                    return (
                      <div className="chart-tooltip">
                        <p>{d.full}</p>
                        <p>
                          <span>Cashflow</span>
                          <strong className="mono-num">{money(d.value)}</strong>
                        </p>
                        <p>
                          <span>Inflow</span>
                          <strong className="mono-num">{money(d.inflow)}</strong>
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {cashData.map((d) => (
                    <Cell
                      key={d.full}
                      fill={d.highlight ? "url(#barFill)" : "#D5E3E0"}
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
        <section className="panel-card" id="alerts">
          <header className="panel-card-head">
            <div>
              <p className="finn-label">Finn noticed</p>
              <h2>Insights</h2>
              <p>Coach tips and alerts from this statement</p>
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
          <div className="bonus-grid">
            <div className="bonus-tile">
              <h4>Duplicates</h4>
              <p className="muted">
                {analysis.bonus.duplicateCharges.length === 0
                  ? "None detected"
                  : `${analysis.bonus.duplicateCharges.length} flagged`}
              </p>
            </div>
            <div className="bonus-tile">
              <h4>Fees</h4>
              <p className="muted">{analysis.bonus.hiddenFees.length} fee-like items</p>
            </div>
            <div className="bonus-tile">
              <h4>Salary</h4>
              <p className="muted">{analysis.bonus.salaryConsistency.note}</p>
            </div>
            <div className="bonus-tile">
              <h4>Cash-heavy</h4>
              <p className="muted">
                {analysis.bonus.cashHeavy.cashPctOfExpenses}% · {analysis.bonus.cashHeavy.note}
              </p>
            </div>
          </div>
        </section>
      )}

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
