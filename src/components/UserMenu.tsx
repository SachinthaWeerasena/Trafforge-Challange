"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthModal } from "./AuthModal";
import { useAuth } from "./AuthProvider";

export function UserMenu() {
  const { user, mode, loading, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  if (loading) {
    return <p className="privacy-chip">Checking session…</p>;
  }

  if (mode === "guest" || !user) {
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

  return (
    <div className="user-menu auth">
      <span className="privacy-chip" title={user.email}>
        {user.email}
      </span>
      <Link href="/history" className="ghost-btn link-btn">
        History
      </Link>
      <button
        type="button"
        className="ghost-btn"
        onClick={() => void logout()}
      >
        Sign out
      </button>
    </div>
  );
}
