"use client";

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
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/categories";
import { formatMoney } from "@/lib/currency";
import type { AnalysisResult } from "@/lib/types";

interface Props {
  analysis: AnalysisResult;
  fileName: string;
  onReset: () => void;
}

const NAV = [
  { href: "#summary", label: "Summary" },
  { href: "#metrics", label: "Metrics" },
  { href: "#spend", label: "Spend" },
  { href: "#alerts", label: "Alerts" },
  { href: "#transactions", label: "Transactions" },
];

export function Dashboard({ analysis, fileName, onReset }: Props) {
  const ccy = analysis.currency || "USD";
  const money = (n: number | null | undefined) => formatMoney(n, ccy);
  const pieData = analysis.topCategories.map((c) => ({
    name: CATEGORY_LABELS[c.category],
    value: Math.round(c.total * 100) / 100,
    category: c.category,
  }));

  const cashData = analysis.cashFlow.map((m) => ({
    month: m.month,
    Inflows: Math.round(m.inflows),
    Outflows: Math.round(m.outflows),
    Net: Math.round(m.net),
  }));

  return (
    <div className="dashboard">
      <div className="dash-toolbar">
        <div>
          <p className="eyebrow">Analyzed · account {analysis.accountMask}</p>
          <h2>{fileName}</h2>
          <div className="meta-row">
            <span className="tag">{analysis.transactions.length} transactions</span>
            <span className="tag" title={`Detected from ${analysis.currencySource}`}>
              Currency · {ccy}
            </span>
            {analysis.aiUsed ? (
              <span className="tag ai">
                AI · {analysis.aiProvider ?? "free"} ·{" "}
                {analysis.aiFeatures.slice(0, 3).join(", ")}
                {analysis.aiFeatures.length > 3 ? "…" : ""}
              </span>
            ) : (
              <span className="tag rules">Rules only</span>
            )}
          </div>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="ghost-btn" onClick={onReset}>
            New upload
          </button>
        </div>
      </div>

      <nav className="section-nav" aria-label="Jump to section">
        {NAV.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>

      <section className="summary-banner" id="summary">
        <h3>Natural-language summary{analysis.aiUsed ? " · AI" : ""}</h3>
        <p>{analysis.naturalLanguageSummary}</p>
      </section>

      {analysis.aiCoachTips.length > 0 && (
        <section className="panel" id="coach">
          <header className="panel-head">
            <div>
              <h2>AI coach tips</h2>
              <p>Actionable ideas grounded in this statement</p>
            </div>
          </header>
          <ol className="coach-list">
            {analysis.aiCoachTips.map((tip, i) => (
              <li key={i} data-n={i + 1}>
                {tip}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="stat-grid" id="metrics">
        <article>
          <span>Income</span>
          <strong className="delta-pos">{money(analysis.totalIncome)}</strong>
        </article>
        <article>
          <span>Expenses</span>
          <strong className="delta-neg">{money(analysis.totalExpenses)}</strong>
        </article>
        <article>
          <span>Net · savings rate</span>
          <strong className={analysis.netSavings >= 0 ? "delta-pos" : "delta-neg"}>
            {money(analysis.netSavings)} · {analysis.savingsRate.toFixed(1)}%
          </strong>
        </article>
        <article>
          <span>Opening → closing</span>
          <strong>
            {money(analysis.openingBalance)} → {money(analysis.closingBalance)}
          </strong>
        </article>
      </div>

      <div className="two-col" id="spend">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Top categories</h2>
              <p>Share of expenses</p>
            </div>
          </header>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {pieData.map((d) => (
                    <Cell key={d.name} fill={CATEGORY_COLORS[d.category]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => money(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="cat-list">
            {analysis.topCategories.map((c) => (
              <li key={c.category}>
                <span>
                  <span
                    className="swatch"
                    style={{ background: CATEGORY_COLORS[c.category] }}
                  />
                  {CATEGORY_LABELS[c.category]}
                </span>
                <em>
                  {money(c.total)} · {c.percentOfExpenses.toFixed(0)}%
                </em>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Cash-flow</h2>
              <p>Inflows, outflows, net by month</p>
            </div>
          </header>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cashData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#5a6f69" }} />
                <YAxis tick={{ fontSize: 12, fill: "#5a6f69" }} width={48} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Bar dataKey="Inflows" fill="#0d9488" radius={[5, 5, 0, 0]} />
                <Bar dataKey="Outflows" fill="#c2410c" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="cash-table">
            <div className="cash-row head">
              <span>Month</span>
              <span>Open</span>
              <span>Close</span>
              <span>Net</span>
            </div>
            {analysis.cashFlow.map((m) => (
              <div className="cash-row" key={m.month}>
                <span>{m.month}</span>
                <span>{money(m.openingBalance)}</span>
                <span>{money(m.closingBalance)}</span>
                <span className={m.net >= 0 ? "pos" : "neg"}>{money(m.net)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="two-col">
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Biggest transactions</h2>
              <p>Largest debits in this period</p>
            </div>
          </header>
          <ul className="txn-mini">
            {analysis.biggestTransactions.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.maskedDescription}</strong>
                  <span>
                    {t.date} · {CATEGORY_LABELS[t.category]}
                  </span>
                </div>
                <em>{money(t.debit)}</em>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Recurring & spikes</h2>
              <p>Patterns worth a second look</p>
            </div>
          </header>
          <h4 className="subhead">Recurring</h4>
          <ul className="txn-mini">
            {analysis.recurringPayments.length === 0 && (
              <li className="muted">No clear recurring pattern.</li>
            )}
            {analysis.recurringPayments.map((r, i) => (
              <li key={i}>
                <div>
                  <strong>{r.merchant}</strong>
                  <span>
                    {r.occurrences}× · {CATEGORY_LABELS[r.category]}
                  </span>
                </div>
                <em>~{money(r.averageAmount)}</em>
              </li>
            ))}
          </ul>
          <h4 className="subhead">Unusual spikes</h4>
          <ul className="txn-mini">
            {analysis.unusualSpikes.length === 0 && (
              <li className="muted">No statistical spikes flagged.</li>
            )}
            {analysis.unusualSpikes.map((s, i) => (
              <li key={i}>
                <div>
                  <strong>{s.description}</strong>
                  <span>
                    {s.date} · {s.reason}
                  </span>
                </div>
                <em>{money(s.amount)}</em>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel" id="alerts">
        <header className="panel-head">
          <div>
            <h2>Bonus alerts</h2>
            <p>Duplicates, fees, salary, cash usage, suggestions</p>
          </div>
        </header>
        {analysis.bonus.aiAnomalyInsight && (
          <p className="anomaly-insight">{analysis.bonus.aiAnomalyInsight}</p>
        )}
        <div className="bonus-grid">
          <div className="bonus-tile">
            <h4>Duplicates</h4>
            {analysis.bonus.duplicateCharges.length === 0 ? (
              <p className="muted">None detected</p>
            ) : (
              analysis.bonus.duplicateCharges.map((d, i) => (
                <p key={i}>
                  {d.description}: {money(d.amount)} on {d.dates.join(" & ")}
                </p>
              ))
            )}
          </div>
          <div className="bonus-tile">
            <h4>Fees</h4>
            <p>{analysis.bonus.hiddenFees.length} fee-like items</p>
          </div>
          <div className="bonus-tile">
            <h4>Salary consistency</h4>
            <p>{analysis.bonus.salaryConsistency.note}</p>
          </div>
          <div className="bonus-tile">
            <h4>Cash-heavy</h4>
            <p>
              {analysis.bonus.cashHeavy.cashPctOfExpenses}% of expenses ·{" "}
              {analysis.bonus.cashHeavy.note}
            </p>
          </div>
          <div className="bonus-tile span-2">
            <h4>Saving suggestions</h4>
            <ul>
              {analysis.bonus.savingSuggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel" id="transactions">
        <header className="panel-head">
          <div>
            <h2>Transactions</h2>
            <p>
              Descriptions masked · categories from rules
              {analysis.aiUsed ? " + AI" : ""}
            </p>
          </div>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
                <th>Ref</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {analysis.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.maskedDescription}</td>
                  <td>{t.debit != null ? money(t.debit) : ""}</td>
                  <td>{t.credit != null ? money(t.credit) : ""}</td>
                  <td>{t.balance != null ? money(t.balance) : ""}</td>
                  <td>{t.reference ?? ""}</td>
                  <td>
                    <span className="pill" data-src={t.categorySource}>
                      {CATEGORY_LABELS[t.category]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
