"use client";

import {
  type FormEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "./AuthProvider";

type Mode = "login" | "signup";

interface Props {
  open: boolean;
  initialMode?: Mode;
  onClose: () => void;
}

export function AuthModal({ open, initialMode = "login", onClose }: Props) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    setMode(initialMode);
    setError(null);
    setPassword("");
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("auth-modal-open");

    const t = window.setTimeout(() => emailRef.current?.focus(), 40);

    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("auth-modal-open");
      previouslyFocused.current?.focus?.();
    };
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!mounted || !open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await login(email, password);
      else await signup(email, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed — check email and password, then try again.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="auth-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="auth-modal-head">
          <div>
            <p className="auth-eyebrow">
              {mode === "login" ? "Signed-in workspace" : "Create your workspace"}
            </p>
            <h2 id={titleId}>
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <p>
              {mode === "login"
                ? "Sign in to save statement history to your account."
                : "Register to keep uploads and revisit insights anytime."}
            </p>
          </div>
          <button
            type="button"
            className="auth-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close sign-in dialog"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <form className="auth-form" onSubmit={onSubmit}>
          <label htmlFor="auth-email">
            Email
            <input
              ref={emailRef}
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
            />
          </label>
          <label htmlFor="auth-password">
            Password
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={busy}
            />
          </label>

          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-footer">
          <p className="auth-switch">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button type="button" onClick={() => setMode("signup")} disabled={busy}>
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button type="button" onClick={() => setMode("login")} disabled={busy}>
                  Sign in
                </button>
              </>
            )}
          </p>

          <button
            type="button"
            className="auth-guest-btn"
            onClick={onClose}
            disabled={busy}
          >
            Continue as guest
          </button>
          <p className="auth-guest-note">
            Guest mode keeps uploads in memory only — nothing is saved to history.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
