"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import SubscriberForm from "@/components/SubscriberForm";
import AppLauncher from "@/components/AppLauncher";
import { SubscriberPrefill, createEmptyPrefill } from "@/lib/subscriberMapper";

// ---------------------------------------------------------------------------
// Turnstile widget (rendered only when the site key is configured)
// ---------------------------------------------------------------------------

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
    };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResultState = "match" | "no-match" | "error" | "rate-limited" | null;

interface PollResult {
  state: ResultState;
  prefill?: SubscriberPrefill;
  filledFields?: string[];
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProviderRegisterPage() {
  const [currentScreen, setCurrentScreen] = useState<"lookup" | "form">("lookup");
  const [nidNumber, setNidNumber] = useState("");
  const [dob, setDob] = useState("");
  const [errors, setErrors] = useState<{ nid?: string; dob?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prefillData, setPrefillData] = useState<SubscriberPrefill | null>(null);
  const [filledFields, setFilledFields] = useState<string[]>([]);

  // Turnstile
  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  // Polling abort control
  const pollAbortRef = useRef<AbortController | null>(null);

  // Guard against double-submits
  const submittingRef = useRef(false);

  // Maximum date allowed is today
  const today = new Date().toISOString().split("T")[0];

  // ---------------------------------------------------------------------------
  // Load Turnstile script when site key is present
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileContainerRef.current) return;

    const tryRender = () => {
      if (
        window.turnstile &&
        turnstileContainerRef.current &&
        !turnstileWidgetId.current
      ) {
        turnstileWidgetId.current = window.turnstile.render(
          turnstileContainerRef.current,
          {
            sitekey: TURNSTILE_SITE_KEY,
            callback: (token: string) => {
              setCaptchaToken(token);
            },
            "expired-callback": () => {
              setCaptchaToken(null);
            },
          }
        );
      }
    };

    tryRender();
    const interval = setInterval(() => {
      if (turnstileWidgetId.current) {
        clearInterval(interval);
      } else {
        tryRender();
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validateNid = (value: string): string | undefined => {
    if (!value) return "National ID Number is required.";
    const clean = value.replace(/\s+/g, "");
    if (!/^\d+$/.test(clean)) return "Only digits are allowed.";
    if (![10, 13, 17].includes(clean.length)) {
      return "NID must be 10, 13, or 17 digits.";
    }
    return undefined;
  };

  const validateDob = (value: string): string | undefined => {
    if (!value) return "Date of Birth is required.";
    const [yearStr] = value.split("-");
    const year = parseInt(yearStr, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(year) || year < 1900 || year > currentYear) {
      return "Please enter a valid birth date.";
    }
    return undefined;
  };

  const validateForm = (): boolean => {
    const nidErr = validateNid(nidNumber);
    const dobErr = validateDob(dob);
    setErrors({ nid: nidErr, dob: dobErr });
    return !nidErr && !dobErr;
  };

  // ---------------------------------------------------------------------------
  // Polling
  // ---------------------------------------------------------------------------

  const pollJob = async (
    jobId: string,
    abort: AbortController
  ): Promise<PollResult> => {
    const maxAttempts = 30; // 30 * 1000ms = 30 seconds
    const interval = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      if (abort.signal.aborted) return { state: "error" };

      await new Promise((resolve) => setTimeout(resolve, interval));
      if (abort.signal.aborted) return { state: "error" };

      try {
        const res = await fetch(`/api/verify/${jobId}`, {
          signal: abort.signal,
          cache: "no-store",
        });

        if (res.status === 429) {
          return { state: "rate-limited" };
        }
        if (!res.ok) {
          return { state: "error" };
        }

        const data = await res.json();

        if (data.status === "completed") {
          return {
            state: "match",
            prefill: data.prefill ?? createEmptyPrefill(nidNumber, dob),
            filledFields: data.filledFields ?? [],
          };
        }
        if (data.status === "no-match") {
          return { state: "no-match" };
        }
        if (data.status === "error") {
          return { state: "error" };
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return { state: "error" };
        }
        return { state: "error" };
      }
    }

    return { state: "error" };
  };

  // ---------------------------------------------------------------------------
  // Submit Search
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!validateForm()) return;

    setPrefillData(null);
    setFilledFields([]);
    submittingRef.current = true;
    setIsSubmitting(true);

    pollAbortRef.current?.abort();
    const abort = new AbortController();
    pollAbortRef.current = abort;

    try {
      const bodyObj: Record<string, string> = { nid: nidNumber, dob };
      if (TURNSTILE_SITE_KEY && captchaToken) {
        bodyObj.captchaToken = captchaToken;
      }

      const submitRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyObj),
        signal: abort.signal,
      });

      const redirectToRegister = (currentJobId?: string) => {
        try {
          fetch("/api/verify/log-redirect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: currentJobId, nid: nidNumber, dob }),
            keepalive: true,
          }).catch(() => {});
        } catch {}
        window.location.href = "http://138.252.124.48:8080/register";
      };

      if (!submitRes.ok) {
        redirectToRegister();
        return;
      }

      const { jobId } = (await submitRes.json()) as { jobId: string };

      const pollRes = await pollJob(jobId, abort);
      if (pollRes.state === "match" && pollRes.prefill) {
        setPrefillData(pollRes.prefill);
        setFilledFields(pollRes.filledFields ?? []);
        setCurrentScreen("form");
      } else {
        redirectToRegister(jobId);
        return;
      }

      if (TURNSTILE_SITE_KEY && turnstileWidgetId.current && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId.current);
        setCaptchaToken(null);
      }
    } catch {
      if (!abort.signal.aborted) {
        try {
          fetch("/api/verify/log-redirect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nid: nidNumber, dob }),
            keepalive: true,
          }).catch(() => {});
        } catch {}
        window.location.href = "http://138.252.124.48:8080/register";
      }
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleReset = () => {
    pollAbortRef.current?.abort();
    setNidNumber("");
    setDob("");
    setErrors({});
    setPrefillData(null);
    setFilledFields([]);
    setCurrentScreen("lookup");
    submittingRef.current = false;

    if (TURNSTILE_SITE_KEY && turnstileWidgetId.current && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId.current);
      setCaptchaToken(null);
    }
  };

  const cleanNid = nidNumber.replace(/\s+/g, "");
  const isNidLengthValid = [10, 13, 17].includes(cleanNid.length);

  const getNidBadgeText = () => {
    if (!cleanNid) return "10, 13, or 17 Digits";
    return `${cleanNid.length} Digits`;
  };

  return (
    <>
      <div className="bg-ambient" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <div className="app-container">
        {/* Header bar */}
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
                <h1>Provider Register</h1>
                <p>NID Verification & Autonomous Subscriber Registration</p>
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
              style={{ background: "rgba(59, 130, 246, 0.15)", color: "var(--sky-blue)", borderColor: "rgba(59, 130, 246, 0.3)" }}
            >
              <span>📱 Number Shop</span>
            </Link>

            <Link
              href="/provider-register"
              className="admin-nav-btn"
              style={{ background: "rgba(16, 185, 129, 0.2)", color: "var(--emerald)", borderColor: "var(--emerald)" }}
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

        {/* Main Content Area */}
        <main className={`main-wrapper ${currentScreen === "form" ? "wide" : ""}`}>
          <div className="form-card">
            {currentScreen === "form" && prefillData ? (
              <SubscriberForm
                initialData={prefillData}
                filledFields={filledFields}
                onBackToSearch={handleReset}
              />
            ) : (
              <>
                <div className="card-header">
                  <h2 className="card-title">Provider Registration & Search</h2>
                  <p className="card-description">
                    Enter National ID Number and Date of Birth to match records and register with ICC or ICON network.
                  </p>
                </div>

                <form id="nid-verification-form" onSubmit={handleSubmit} noValidate>
                  {/* Field 1: NID Number */}
                  <div className="form-group">
                    <div className="form-label-row">
                      <label htmlFor="nid-input" className="form-label">
                        National Identity Number (NID)
                        <span className="required-asterisk" aria-hidden="true">*</span>
                      </label>
                      <span className={`field-badge ${isNidLengthValid ? "valid" : ""}`} aria-live="polite">
                        {getNidBadgeText()}
                      </span>
                    </div>

                    <div className="input-container">
                      <input
                        type="text"
                        id="nid-input"
                        name="nidNumber"
                        className={`form-input ${errors.nid ? "error" : ""}`}
                        placeholder="e.g. 19902612345678901 or 1234567890"
                        value={nidNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^\d\s]/g, "");
                          setNidNumber(val);
                          if (errors.nid) setErrors((prev) => ({ ...prev, nid: undefined }));
                        }}
                        autoComplete="off"
                        inputMode="numeric"
                        aria-required="true"
                        aria-invalid={!!errors.nid}
                      />
                    </div>
                    {errors.nid && (
                      <p className="error-message" role="alert">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {errors.nid}
                      </p>
                    )}
                  </div>

                  {/* Field 2: Date of Birth */}
                  <div className="form-group">
                    <div className="form-label-row">
                      <label htmlFor="dob-input" className="form-label">
                        Date of Birth (DOB)
                        <span className="required-asterisk" aria-hidden="true">*</span>
                      </label>
                      <span className="field-badge">YYYY-MM-DD</span>
                    </div>

                    <div className="input-container">
                      <input
                        type="date"
                        id="dob-input"
                        name="dob"
                        className={`form-input ${errors.dob ? "error" : ""}`}
                        max={today}
                        value={dob}
                        onChange={(e) => {
                          setDob(e.target.value);
                          if (errors.dob) setErrors((prev) => ({ ...prev, dob: undefined }));
                        }}
                        aria-required="true"
                        aria-invalid={!!errors.dob}
                      />
                    </div>
                    {errors.dob && (
                      <p className="error-message" role="alert">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        {errors.dob}
                      </p>
                    )}
                  </div>

                  {/* Turnstile Container */}
                  {TURNSTILE_SITE_KEY && (
                    <div className="form-group turnstile-wrapper">
                      <div ref={turnstileContainerRef} />
                    </div>
                  )}

                  {/* Submit Button */}
                  <div className="form-actions">
                    <button
                      type="submit"
                      id="search-btn"
                      className="submit-btn"
                      disabled={isSubmitting || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
                    >
                      {isSubmitting ? (
                        <>
                          <span className="spinner" aria-hidden="true" />
                          <span>Searching &amp; Verifying...</span>
                        </>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <span>Search &amp; Verify</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </main>

        <footer className="portal-footer">
          <p>&copy; 2026 Data Verification Search Portal. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
