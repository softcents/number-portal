"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppLauncher from "@/components/AppLauncher";

export default function CentralLoginPage() {
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
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-main)",
        color: "var(--text-main)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header bar */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background: "var(--sky-indigo)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "14px",
            }}
          >
            S
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-heading)" }}>Softcents Systems</div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>Central Identity & SSO</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link
            href="/portal"
            style={{ fontSize: "13px", color: "var(--text-muted)", textDecoration: "none", fontWeight: 500 }}
          >
            Number Catalog
          </Link>
          <AppLauncher currentAppId="number-sale" />
        </div>
      </header>

      {/* Main Login Card */}
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          border: "1px solid var(--border-subtle)",
          borderRadius: "16px",
          padding: "36px 32px",
          boxShadow: "var(--shadow-modal)",
          marginTop: "40px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "999px",
              background: "var(--indigo-light)",
              border: "1px solid #c7d2fe",
              color: "var(--indigo)",
              fontSize: "11px",
              fontWeight: 700,
              marginBottom: "16px",
            }}
          >
            <span>🔐</span>
            <span>Single Sign-On</span>
          </div>

          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-heading)" }}>
            Sign in with Central Identity
          </h1>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0, lineHeight: "1.5" }}>
            Use your unified Central Identity account credentials to access Number Sale Management.
          </p>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
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

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
              marginTop: "8px",
              padding: "12px",
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
            {isLoading ? "Signing in..." : "Sign In with Central Identity"}
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
    </div>
  );
}
