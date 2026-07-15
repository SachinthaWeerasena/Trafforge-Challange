"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/AuthModal";
import type { AnalysisResult } from "@/lib/types";

type StatementRow = {
  id: string;
  fileName: string;
  fileType: string | null;
  currency: string | null;
  transactionCount: number;
  uploadDate: string;
};

export default function HistoryPage() {
  const { user, mode, loading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<StatementRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/statements", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load history");
      setRows([]);
      return;
    }
    setRows(data.statements ?? []);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (mode === "authenticated") {
      void load();
    } else {
      setRows([]);
    }
  }, [loading, mode, load]);

  async function openStatement(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/statements/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      const analysis = data.analysis as AnalysisResult;
      const fileName = data.statement.fileName as string;
      sessionStorage.setItem(
        "si_restore",
        JSON.stringify({ analysis, fileName, statementId: id })
      );
      router.push("/?restored=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open");
    } finally {
      setBusyId(null);
    }
  }

  async function removeStatement(id: string) {
    if (!confirm("Delete this saved statement from your history?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/statements/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell crumbs={["History"]}>
      <section className="history-page">
        <div className="dash-title-row">
          <div>
            <h1 className="dash-title">Your statements</h1>
            <p className="dash-sub">
              Saved analyses for signed-in accounts only. Guest uploads are never stored.
            </p>
          </div>
        </div>

        {mode !== "authenticated" && !loading && (
          <div className="history-locked panel-card">
            <h2>Sign in required</h2>
            <p>Create an account or sign in to view and reopen past statements.</p>
            <button type="button" className="file-btn" onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          </div>
        )}

        {mode === "authenticated" && (
          <>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            {rows.length === 0 && !error && (
              <div className="history-empty panel-card">
                <p className="finn-label">Finn noticed</p>
                <p>No statement uploaded yet — drop a PDF or CSV on the home page to get started.</p>
                <Link href="/" className="file-btn link-as-btn">
                  Upload a statement
                </Link>
              </div>
            )}
            <ul className="history-list">
              {rows.map((row) => (
                <li key={row.id} className="history-item panel-card">
                  <div>
                    <strong>{row.fileName}</strong>
                    <p className="muted">
                      {new Date(row.uploadDate).toLocaleString()} · {row.transactionCount}{" "}
                      txns
                      {row.currency ? ` · ${row.currency}` : ""}
                    </p>
                  </div>
                  <div className="history-actions">
                    <button
                      type="button"
                      className="file-btn"
                      disabled={busyId === row.id}
                      onClick={() => void openStatement(row.id)}
                    >
                      {busyId === row.id ? "Opening…" : "Open"}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={busyId === row.id}
                      onClick={() => void removeStatement(row.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {user && (
              <p className="muted history-foot-note">Signed in as {user.email}</p>
            )}
          </>
        )}
      </section>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </AppShell>
  );
}
