"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { AnalysisResult, ChatMessage } from "@/lib/types";

interface Props {
  analysis: AnalysisResult | null;
}

const SUGGESTIONS = [
  "How much did I spend on Uber?",
  "What was my biggest expense?",
  "How much on groceries?",
  "Any saving tips for me?",
];

const WELCOME: ChatMessage = {
  role: "assistant",
  content:
    "Hi — I’m Finn. Ask me about your spend, categories, fees, or savings. Try a quick question below.",
};

export function Chatbot({ analysis }: Props) {
  const panelId = useId();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const analysisKey = analysis?.analyzedAt ?? null;

  // Reset chat when a new statement is analyzed
  useEffect(() => {
    if (!analysisKey) return;
    setMessages([WELCOME]);
    setHasUnread(true);
    setOpen(false);
  }, [analysisKey]);

  useEffect(() => {
    const openFromShell = () => {
      setOpen(true);
      setHasUnread(false);
    };
    window.addEventListener("finsight:open-finn", openFromShell);
    return () => window.removeEventListener("finsight:open-finn", openFromShell);
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  useEffect(() => {
    if (!open) return;
    setHasUnread(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(t);
  }, [open]);

  // Escape closes panel; restore focus to launcher
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        launcherRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Simple focus trap inside panel
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const ask = useCallback(
    async (question: string) => {
      if (!question.trim() || busy) return;
      if (!analysis) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: question },
          {
            role: "assistant",
            content:
              "Upload a bank statement first — then I can decode your spend.",
          },
        ]);
        setInput("");
        return;
      }

      const historyForApi = messages.filter(
        (m, i) => !(i === 0 && m.role === "assistant")
      );
      const nextHistory: ChatMessage[] = [
        ...messages,
        { role: "user", content: question },
      ];
      setMessages(nextHistory);
      setInput("");
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            transactions: analysis.transactions,
            history: historyForApi,
            analysisHint: {
              totalIncome: analysis.totalIncome,
              totalExpenses: analysis.totalExpenses,
              savingsRate: analysis.savingsRate,
              topCategories: analysis.topCategories,
              naturalLanguageSummary: analysis.naturalLanguageSummary,
              currency: analysis.currency,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Chat failed");
        setMessages([
          ...nextHistory,
          { role: "assistant", content: data.answer },
        ]);
        if (!open) setHasUnread(true);
      } catch (e) {
        setMessages([
          ...nextHistory,
          {
            role: "assistant",
            content: e instanceof Error ? e.message : "Chat failed",
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [analysis, busy, messages, open]
  );

  const toggle = () => {
    setOpen((v) => !v);
  };

  const ready = Boolean(analysis);

  return (
    <div className={`chat-fab-root ${open ? "is-open" : ""}`}>
      {/* Popup panel */}
      <div
        ref={panelRef}
        id={panelId}
        className={`chat-popup ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${panelId}-status`}
        aria-hidden={!open}
        hidden={!open}
      >
        <header className="chat-popup-head">
          <div className="chat-popup-identity">
            <span className="chat-avatar" aria-hidden>
              <img src="/brand/finsight_icon.svg" alt="" width={40} height={40} />
            </span>
            <div>
              <h2 id={titleId}>Ask Finn</h2>
              <p
                className="chat-status"
                id={`${panelId}-status`}
                role="status"
                aria-live="polite"
              >
                <span
                  className={`status-dot ${ready ? "online" : "idle"}`}
                  aria-hidden="true"
                />
                <span className="chat-status-text">
                  {ready
                    ? "Status: Online — ready for questions"
                    : "Status: Waiting — upload a statement first"}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            className="chat-icon-btn"
            onClick={() => {
              setOpen(false);
              launcherRef.current?.focus();
            }}
            aria-label="Close Ask Finn chat"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="chat-popup-body" ref={logRef} aria-live="polite" aria-relevant="additions">
          {messages.map((m, i) => (
            <div key={`${i}-${m.role}`} className={`chat-bubble-row ${m.role}`}>
              {m.role === "assistant" && (
                <span className="chat-mini-avatar" aria-hidden>
                  <img src="/brand/finsight_icon.svg" alt="" width={28} height={28} />
                </span>
              )}
              <div
                className={`chat-bubble ${m.role}`}
                role={m.role === "assistant" ? "article" : undefined}
                aria-label={m.role === "assistant" ? "Message from Finn" : "Your message"}
              >
                <p>{m.content}</p>
              </div>
            </div>
          ))}
          {busy && (
            <div className="chat-bubble-row assistant">
              <span className="chat-mini-avatar" aria-hidden>
                <img src="/brand/finsight_icon.svg" alt="" width={28} height={28} />
              </span>
              <div className="chat-bubble assistant typing" aria-label="Finn is typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}
        </div>

        {ready && messages.length <= 2 && !busy && (
          <div className="chat-suggestions" aria-label="Suggested questions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="chat-chip"
                onClick={() => void ask(s)}
                disabled={busy}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="chat-popup-form"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <label className="sr-only" htmlFor={`${panelId}-input`}>
            Message
          </label>
          <input
            ref={inputRef}
            id={`${panelId}-input`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ready ? "Ask Finn about your spending…" : "Upload a statement first…"}
            disabled={busy}
            autoComplete="off"
          />
          <button
            type="submit"
            className="chat-send"
            disabled={busy || !input.trim()}
            aria-label="Send message to Finn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 12l16-7-7 16-2.5-6.5L4 12z" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>

      {/* Launcher */}
      <button
        ref={launcherRef}
        type="button"
        className={`chat-launcher ${open ? "open" : ""} ${hasUnread && !open ? "pulse" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={open ? "Close Ask Finn" : "Open Ask Finn"}
      >
        <span className="chat-launcher-icon" aria-hidden>
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path
                d="M21 12a8.5 8.5 0 01-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.5-4.1A8.5 8.5 0 1121 12z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M8.5 11.5h7M8.5 14.5h4" strokeLinecap="round" />
            </svg>
          )}
        </span>
        {hasUnread && !open && (
          <span className="chat-badge" aria-label="1 unread message from Finn">
            1
          </span>
        )}
      </button>
    </div>
  );
}
