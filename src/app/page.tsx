"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppLauncher from "@/components/AppLauncher";

export default function HomePageCentralLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage("Please enter your Central Identity email and password.");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Authentication failed. Please verify credentials.");
        setIsLoading(false);
        return;
      }

      // Successfully signed in -> Redirect to Portal
      router.push("/portal");
    } catch (err: any) {
      setErrorMessage(err?.message || "An unexpected network error occurred.");
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="bg-ambient" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <div className="app-container">
        {/* Navigation Header */}
        <header className="portal-header">
          <div className="header-brand">
            <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px", color: "inherit" }}>
              <div className="brand-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div className="brand-text">
                <h1>Data Verification &amp; Number Sale Portal</h1>
                <p>Central Identity &amp; Master Authentication</p>
              </div>
            </Link>
          </div>

          <div className="header-actions">
            <div className="status-badge">
              <span className="status-dot" />
              <span>Online</span>
            </div>

            {/* Navigation Options: Number Shop, Provider Register, Admin */}
            <Link
              href="/portal"
              className="admin-nav-btn"
              style={{ background: "var(--sky-blue-light)", color: "#0369a1", borderColor: "#bae6fd" }}
            >
              <span>📱 Number Shop</span>
            </Link>

            <Link
              href="/provider-register"
              className="admin-nav-btn"
              style={{ background: "var(--emerald-light)", color: "#065f46", borderColor: "var(--emerald-border)" }}
            >
              <span>⚡ Provider Register</span>
            </Link>

            <Link href="/admin/login" className="admin-nav-btn" id="admin-panel-btn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>Admin</span>
            </Link>

            <AppLauncher currentAppId="number-sale" />
          </div>
        </header>

        {/* Main Central Login View */}
        <main className="main-wrapper" style={{ minHeight: "calc(100vh - 160px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            className="form-card"
            style={{
              maxWidth: "460px",
              padding: "36px 32px",
              borderRadius: "16px",
              boxShadow: "var(--shadow-modal)",
              background: "#ffffff",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "26px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 14px",
                  borderRadius: "999px",
                  background: "var(--indigo-light)",
                  border: "1px solid #c7d2fe",
                  color: "var(--indigo)",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  marginBottom: "14px",
                }}
              >
                <span>🔐</span>
                <span>Single Sign-On</span>
              </div>

              <h2 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-heading)" }}>
                Sign in with Central Identity
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: "1.5" }}>
                Log in to access your customer panel, phone numbers, and payment ledger.
              </p>
            </div>

            {errorMessage && (
              <div
                style={{
                  padding: "11px 14px",
                  borderRadius: "10px",
                  background: "var(--rose-light)",
                  border: "1px solid var(--rose-border)",
                  color: "#991b1b",
                  fontSize: "12.5px",
                  marginBottom: "20px",
                  lineHeight: "1.4",
                  fontWeight: 500,
                }}
              >
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <label
                  htmlFor="email"
                  style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-heading)", marginBottom: "6px" }}
                >
                  Email or Central Account ID
                </label>
                <input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. user@softcents.com"
                  autoComplete="username"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    background: "#ffffff",
                    border: "1px solid var(--border-medium)",
                    borderRadius: "8px",
                    color: "var(--text-main)",
                    fontSize: "13.5px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label
                    htmlFor="password"
                    style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-heading)" }}
                  >
                    Password
                  </label>
                  <a
                    href="http://138.252.124.48:8080/forgot-password"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "11.5px", color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}
                  >
                    Forgot password?
                  </a>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    background: "#ffffff",
                    border: "1px solid var(--border-medium)",
                    borderRadius: "8px",
                    color: "var(--text-main)",
                    fontSize: "13.5px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  marginTop: "6px",
                  padding: "13px",
                  background: "var(--sky-indigo)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: isLoading ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  boxShadow: "0 4px 14px rgba(2, 132, 199, 0.25)",
                  opacity: isLoading ? 0.7 : 1,
                }}
              >
                {isLoading ? "Signing in..." : "Sign In to User Panel"}
              </button>
            </form>

            <div
              style={{
                marginTop: "24px",
                paddingTop: "18px",
                borderTop: "1px solid var(--border-subtle)",
                textAlign: "center",
                fontSize: "12.5px",
                color: "var(--text-dim)",
              }}
            >
              Don't have an account yet?{" "}
              <a
                href="http://138.252.124.48:8080/register"
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 700 }}
              >
                Register on Central Identity →
              </a>
            </div>
          </div>
        </main>

        <footer className="portal-footer">
          <p>&copy; 2026 Softcents Systems. Central Identity &amp; Number Sale Management.</p>
        </footer>
      </div>
    </>
  );
}
