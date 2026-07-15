"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserMenu } from "@/components/UserMenu";

type Props = {
  crumbs?: string[];
  children: ReactNode;
  headerAction?: ReactNode;
  onOpenFinn?: () => void;
};

export function AppShell({
  crumbs = ["Dashboard"],
  children,
  headerAction,
  onOpenFinn,
}: Props) {
  const pathname = usePathname();
  const { mode } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const isHistory = pathname?.startsWith("/history");
  const showHistory = mode === "authenticated";

  return (
    <div className={`app-frame ${navOpen ? "nav-open" : ""}`}>
      <aside className="app-sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <span className="logo-mark" aria-hidden>
            F
          </span>
          <span className="sidebar-brand-name">Finsight</span>
        </div>

        <label className="sidebar-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input type="search" placeholder="Search" aria-label="Search" />
          <kbd>⌘K</kbd>
        </label>

        <nav className="sidebar-nav">
          <p className="sidebar-group">Main menu</p>
          <Link
            href="/"
            className={`sidebar-link ${!isHistory ? "active" : ""}`}
            onClick={() => setNavOpen(false)}
          >
            <IconGrid />
            Dashboard
          </Link>
          <a
            href="/#transactions"
            className="sidebar-link"
            onClick={() => setNavOpen(false)}
          >
            <IconList />
            Transactions
          </a>
          {showHistory && (
            <Link
              href="/history"
              className={`sidebar-link ${isHistory ? "active" : ""}`}
              onClick={() => setNavOpen(false)}
            >
              <IconFolder />
              History
              <span className="sidebar-badge">Saved</span>
            </Link>
          )}

          <p className="sidebar-group">Features</p>
          <button
            type="button"
            className="sidebar-link as-button"
            onClick={() => {
              setNavOpen(false);
              onOpenFinn?.();
              document.getElementById("ask-finn")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <IconChat />
            Ask Finn
          </button>
          <a href="/#spend" className="sidebar-link" onClick={() => setNavOpen(false)}>
            <IconChart />
            Cash flow
          </a>
          <a href="/#alerts" className="sidebar-link" onClick={() => setNavOpen(false)}>
            <IconAlert />
            Insights
          </a>

          <p className="sidebar-group">General</p>
          <div className="sidebar-link row-static">
            <IconMoon />
            Theme
            <span className="sidebar-theme">
              <ThemeToggle />
            </span>
          </div>
        </nav>

        <div className="sidebar-promo">
          <p className="sidebar-promo-kicker">Finn Pro</p>
          <p className="sidebar-promo-copy">
            Get deeper category coaching and statement comparisons.
          </p>
          <button type="button" className="sidebar-promo-btn" onClick={() => onOpenFinn?.()}>
            Ask Finn
          </button>
          <a className="sidebar-promo-link" href="/#summary">
            Learn more
          </a>
        </div>
      </aside>

      {navOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="app-main">
        <header className="app-header">
          <div className="app-header-left">
            <button
              type="button"
              className="nav-burger"
              aria-label="Open menu"
              onClick={() => setNavOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <Link href="/">Finsight</Link>
              {crumbs.map((c) => (
                <span key={c}>
                  <span className="crumb-sep" aria-hidden>
                    ›
                  </span>
                  <span className="crumb-current">{c}</span>
                </span>
              ))}
            </nav>
          </div>

          <div className="app-header-right">
            <button
              type="button"
              className="header-icon-btn"
              aria-label="Ask Finn"
              title="Ask Finn"
              onClick={() => onOpenFinn?.()}
            >
              <IconChat />
            </button>
            {headerAction}
            <UserMenu compact />
          </div>
        </header>

        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}

function IconGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M21 12a8.5 8.5 0 01-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.5-4.1A8.5 8.5 0 1121 12z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 19V5M10 19V9M16 19v-6M22 19H2" strokeLinecap="round" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M12 9v4m0 4h.01M10.3 4.2L2.6 18a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M21 14.3A8.5 8.5 0 1110.2 3a7 7 0 0010.8 11.3z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
