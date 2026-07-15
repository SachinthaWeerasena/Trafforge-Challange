"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UploadZone } from "@/components/UploadZone";
import { Dashboard } from "@/components/Dashboard";
import { Chatbot } from "@/components/Chatbot";
import { useAuth } from "@/components/AuthProvider";
import type { AnalysisResult } from "@/lib/types";

interface AiStatus {
  primary: string | null;
  configured: Array<{ id: string; label: string; model: string; free: boolean }>;
}

function openFinn() {
  window.dispatchEvent(new CustomEvent("finsight:open-finn"));
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
      setSavedNotice("Finn restored this statement from your history.");
    } catch {
      /* ignore */
    }
  }, []);

  const aiReady = Boolean(aiStatus?.configured?.length);

  return (
    <AppShell
      crumbs={[analysis ? "Dashboard" : "Upload"]}
      onOpenFinn={openFinn}
    >
      {!analysis ? (
        <div className="upload-view">
          <div className="upload-intro">
            <p className={`hero-kicker ${aiReady ? "" : "warn"}`}>
              <span className="dot" aria-hidden />
              {aiReady
                ? "Finn ready · AI insights on"
                : "Rules mode · add an AI key to wake Finn"}
            </p>
            <h1>Your money, decoded.</h1>
            <p className="lede">
              Upload a statement for categories, cash-flow, and answers from Finn
              {mode === "authenticated"
                ? " — saved to your account."
                : " — guest mode keeps nothing after this session."}
            </p>
          </div>

          <UploadZone
            busy={busy}
            setBusy={setBusy}
            onAnalyzed={({ analysis: a, fileName: f, meta }) => {
              setAnalysis(a);
              setFileName(f);
              if (meta?.stored) {
                setSavedNotice("Saved to your Finsight history.");
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
            <span>Try a sample:</span>
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

      <Chatbot analysis={analysis} />
    </AppShell>
  );
}
