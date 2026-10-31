"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage("Please enter both username and password.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Authentication failed. Please try again.");
      } else {
        setSuccessMessage("Login successful! Redirecting to Admin Panel...");
        setTimeout(() => {
          router.push("/admin");
        }, 800);
      }
    } catch {
      setErrorMessage("An unexpected network error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="bg-ambient" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <div className="app-container">
        {/* Minimal Header */}
        <header className="portal-header">
          <div className="header-brand">
            <div className="brand-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div className="brand-text">
              <h1>Data Verification Search Portal</h1>
              <p>Admin Portal</p>
            </div>
          </div>
          <Link href="/" className="admin-back-link" style={{ margin: 0, width: "auto" }}>
            <span>← Search Portal</span>
          </Link>
        </header>

        {/* Minimal Login Card */}
        <main className="admin-login-wrapper">
          <div className="admin-login-card">
            <div className="admin-header-center">
              <div className="admin-icon-shield">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h1>Admin Panel Login</h1>
              <p>Enter administrator credentials to proceed</p>
            </div>

            {errorMessage && (
              <div className="admin-alert-banner admin-alert-error" role="alert">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0, marginTop: "1px" }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="admin-alert-banner admin-alert-success" role="status">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0, marginTop: "1px" }}
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="admin-form">
              {/* Field 1: Username */}
              <div className="admin-input-group">
                <label htmlFor="admin-username">Username</label>
                <div className="admin-input-wrapper">
                  <span className="admin-input-icon">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <input
                    id="admin-username"
                    name="username"
                    type="text"
                    required
                    autoComplete="username"
                    placeholder="Enter username"
                    className="admin-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Field 2: Password */}
              <div className="admin-input-group">
                <label htmlFor="admin-password">Password</label>
                <div className="admin-input-wrapper">
                  <span className="admin-input-icon">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="admin-password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Enter password"
                    className="admin-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                id="admin-login-submit"
                className="admin-btn-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" x2="3" y1="12" y2="12" />
                    </svg>
                    <span>Login to Admin Panel</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </main>

        <footer style={{ textAlign: "center", padding: "16px 0", color: "var(--text-dim)", fontSize: "12px" }}>
          &copy; {new Date().getFullYear()} Data Verification Search Portal. All rights reserved.
        </footer>
      </div>
    </>
  );
}
