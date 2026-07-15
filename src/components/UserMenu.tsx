"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthModal } from "./AuthModal";
import { useAuth } from "./AuthProvider";

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, mode, loading, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading) {
    return <p className="privacy-chip">…</p>;
  }

  if (mode === "guest" || !user) {
    if (compact) {
      return (
        <>
          <button
            type="button"
            className="user-avatar guest"
            aria-label="Sign in"
            onClick={() => {
              setAuthMode("login");
              setAuthOpen(true);
            }}
          >
            G
          </button>
          <AuthModal
            open={authOpen}
            initialMode={authMode}
            onClose={() => setAuthOpen(false)}
          />
        </>
      );
    }
    return (
      <>
        <div className="user-menu guest">
          <span className="privacy-chip">Guest · nothing saved</span>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setAuthMode("login");
              setAuthOpen(true);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className="file-btn user-signup"
            onClick={() => {
              setAuthMode("signup");
              setAuthOpen(true);
            }}
          >
            Sign up
          </button>
        </div>
        <AuthModal
          open={authOpen}
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
        />
      </>
    );
  }

  const initial = (user.email?.[0] || "U").toUpperCase();

  if (compact) {
    return (
      <div className="user-menu-compact">
        <button
          type="button"
          className="user-avatar"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          {initial}
        </button>
        {menuOpen && (
          <div className="user-popover" role="menu">
            <p className="user-popover-email">{user.email}</p>
            <Link href="/history" className="user-popover-link" role="menuitem">
              History
            </Link>
            <button
              type="button"
              className="user-popover-link"
              role="menuitem"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="user-menu auth">
      <span className="privacy-chip" title={user.email}>
        {user.email}
      </span>
      <Link href="/history" className="ghost-btn link-btn">
        History
      </Link>
      <button type="button" className="ghost-btn" onClick={() => void logout()}>
        Sign out
      </button>
    </div>
  );
}
