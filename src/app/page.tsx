"use client";

import { useEffect, useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { Dashboard } from "@/components/Dashboard";
import { Chatbot } from "@/components/Chatbot";
import type { AnalysisResult } from "@/lib/types";

interface AiStatus {
  primary: string | null;
  configured: Array<{ id: string; label: string; model: string; free: boolean }>;
}

export default function Home() {
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    void fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d) => setAiStatus(d))
      .catch(() => setAiStatus(null));
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
            <p className="brand-sub">Personal banking analyzer</p>
          </div>
        </div>
        <p className="privacy-chip">Private session · account # masked</p>
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
            answers — without keeping your raw file.
          </p>

          <UploadZone
            busy={busy}
            setBusy={setBusy}
            onAnalyzed={({ analysis: a, fileName: f }) => {
              setAnalysis(a);
              setFileName(f);
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
        <Dashboard
          analysis={analysis}
          fileName={fileName}
          onReset={() => {
            setAnalysis(null);
            setFileName("");
          }}
        />
      )}

      <footer className="foot">
        Synthetic demo data only · never upload real customer statements
      </footer>

      <Chatbot analysis={analysis} />
    </main>
  );
}
