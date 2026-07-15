"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

interface Props {
  onAnalyzed: (payload: {
    analysis: import("@/lib/types").AnalysisResult;
    fileName: string;
    meta?: { stored?: boolean; mode?: string; statementId?: string | null };
  }) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
}

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function UploadZone({ onAnalyzed, busy, setBusy }: Props) {
  const { mode } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [optInStore, setOptInStore] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File, pdfPassword?: string) => {
      setError(null);
      setBusy(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("optInStore", String(optInStore));
        if (pdfPassword?.trim()) {
          form.append("password", pdfPassword.trim());
        }
        const res = await fetch("/api/analyze", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "PASSWORD_REQUIRED" || /password/i.test(data.error || "")) {
            setNeedsPassword(true);
            setSelectedFile(file);
            setTimeout(() => passwordRef.current?.focus(), 50);
          }
          throw new Error(data.error || "Upload failed");
        }
        setNeedsPassword(false);
        setPassword("");
        setSelectedFile(null);
        onAnalyzed({
          analysis: data.analysis,
          fileName: file.name,
          meta: {
            stored: Boolean(data.meta?.stored),
            mode: data.meta?.mode,
            statementId: data.meta?.statementId ?? null,
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onAnalyzed, optInStore, setBusy]
  );

  const acceptFile = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setError(null);
      setNeedsPassword(false);
      setPassword("");
      // Fresh file starts without a password; locked PDFs return PASSWORD_REQUIRED
      void upload(file, "");
    },
    [upload]
  );

  const retryWithPassword = useCallback(() => {
    if (!selectedFile) return;
    void upload(selectedFile, password);
  }, [password, selectedFile, upload]);

  return (
    <section className="upload-panel" aria-label="Upload statement">
      <div
        className={`dropzone ${dragOver ? "drag" : ""} ${busy ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) acceptFile(f);
        }}
      >
        <div className="drop-icon" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" strokeLinecap="round" />
          </svg>
        </div>
        <p className="drop-title">
          {busy
            ? "Reading your statement…"
            : selectedFile
              ? selectedFile.name
              : "Drop PDF or CSV here"}
        </p>
        <p className="drop-sub">
          {busy
            ? "Categorizing, summarizing, and preparing insights"
            : selectedFile
              ? isPdfFile(selectedFile)
                ? "PDF selected — enter a password if the file is locked, then analyze"
                : "Ready to analyze"
              : "Live ingest for demo — nothing is pre-loaded"}
        </p>

        {busy ? (
          <div className="busy-row" role="status" aria-live="polite">
            <span className="spinner" aria-hidden />
            Analyzing with AI + rules…
          </div>
        ) : (
          <div className="upload-actions">
            <label className="file-btn">
              {selectedFile ? "Choose another" : "Choose file"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.pdf,text/csv,application/pdf"
                disabled={busy}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) acceptFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            {selectedFile && (
              <button
                type="button"
                className="file-btn secondary"
                onClick={() => void upload(selectedFile, password)}
              >
                Analyze statement
              </button>
            )}
          </div>
        )}
      </div>

      {(needsPassword || (selectedFile && isPdfFile(selectedFile))) && (
        <div className={`password-box ${needsPassword ? "required" : ""}`}>
          <label htmlFor="pdf-password">
            {needsPassword
              ? "This PDF is password-protected — enter the password"
              : "PDF password (optional)"}
          </label>
          <div className="password-row">
            <input
              ref={passwordRef}
              id="pdf-password"
              type="password"
              autoComplete="off"
              placeholder="Statement / PDF password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedFile) {
                  e.preventDefault();
                  retryWithPassword();
                }
              }}
            />
            {needsPassword && selectedFile && (
              <button
                type="button"
                className="file-btn"
                disabled={busy || !password.trim()}
                onClick={retryWithPassword}
              >
                Unlock & analyze
              </button>
            )}
          </div>
          <p className="password-hint">
            Password is used only to open this file in memory and is never stored.
          </p>
        </div>
      )}

      {mode === "authenticated" ? (
        <p className="opt-in auth-persist-note">
          Signed in — processed insights will be saved to your history (raw file bytes
          are not stored).
        </p>
      ) : (
        <label className="opt-in">
          <input
            type="checkbox"
            checked={optInStore}
            onChange={(e) => setOptInStore(e.target.checked)}
          />
          <span>
            Guest mode never saves history. Sign in to keep statements. (Opt-in alone
            does not persist data.)
          </span>
        </label>
      )}

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
