"use client";

import { useEffect, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { Dashboard } from "@/components/Dashboard";
import { Chatbot } from "@/components/Chatbot";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/components/AuthProvider";
import type { AnalysisResult } from "@/lib/types";

interface AiStatus {
  primary: string | null;
  configured: Array<{ id: string; label: string; model: string; free: boolean }>;
}

export default function Home() {
  const { mode } = useAuth();
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setAiStatus(d))
      .catch(() => setAiStatus(null));
  }, []);

  // Restore a statement opened from History
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("si_restore");
      if (!raw) return;
      sessionStorage.removeItem("si_restore");
      const parsed = JSON.parse(raw) as {
        analysis: AnalysisResult;
        fileName: string;
      };
      setAnalysis(parsed.analysis);
      setFileName(parsed.fileName);
      setSavedNotice("Restored from your saved history.");
    } catch {
      /* ignore */
    }
  }, []);

  const aiReady = Boolean(aiStatus?.configured?.length);

  return (
    <main className="shell">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <span className="logo-mark">SI</span>
          <div>
            <p className="brand-name">StatementInsight</p>
            <p className="brand-sub">
              {mode === "authenticated"
                ? "Signed in · history enabled"
                : "Guest · no long-term storage"}
            </p>
          </div>
        </div>
        <UserMenu />
      </header>

      {!analysis ? (
        <div className="hero">
          <p className={`hero-kicker ${aiReady ? "" : "warn"}`}>
            <span className="dot" aria-hidden />
            {aiReady
              ? `AI ready · ${aiStatus!.configured.map((p) => p.id).join(" → ")}`
              : "Rules mode · add a free AI key for full insights"}
          </p>

          <h1>StatementInsight</h1>
          <p className="lede">
            Upload a statement. Get categories, cash-flow, a plain-English summary, and
            answers
            {mode === "authenticated"
              ? " — saved to your account history."
              : " — without keeping your raw file (guest mode)."}
          </p>

          <UploadZone
            busy={busy}
            setBusy={setBusy}
            onAnalyzed={({ analysis: a, fileName: f, meta }) => {
              setAnalysis(a);
              setFileName(f);
              if (meta?.stored) {
                setSavedNotice("Saved to your account history.");
              } else {
                setSavedNotice(
                  mode === "guest"
                    ? "Guest result — not saved. Sign in before upload to keep history."
                    : null
                );
              }
            }}
          />

          <div className="sample-row">
            <span>Try a synthetic sample:</span>
            <a className="sample-link" href="/samples/sample-statement.csv" download>
              CSV
            </a>
            <a className="sample-link" href="/samples/sample-statement.pdf" download>
              PDF
            </a>
          </div>
        </div>
      ) : (
        <>
          {savedNotice && <p className="save-toast">{savedNotice}</p>}
          <Dashboard
            analysis={analysis}
            fileName={fileName}
            onReset={() => {
              setAnalysis(null);
              setFileName("");
              setSavedNotice(null);
            }}
          />
        </>
      )}

      <footer className="foot">
        Synthetic demo data only · never upload real customer statements
      </footer>

      <Chatbot analysis={analysis} />
    </main>
  );
}
