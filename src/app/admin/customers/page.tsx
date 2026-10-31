"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#ffffff",
  border: "1px solid var(--border-subtle)",
  borderRadius: "8px",
  color: "var(--text-main)",
  padding: "8px 12px",
  fontSize: "13px",
  outline: "none",
};

interface Customer {
  id: string;
  centralIdentityUserId: string;
  fullName: string;
  email: string;
  phoneNumber?: string;
  customerType: string;
  companyName?: string;
  kycVerifiedAt?: string;
  isActive: boolean;
  createdAt: string;
  _count?: { numbers: number; orders: number; wallets: number };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Impersonation modal state
  const [impersonateTarget, setImpersonateTarget] = useState<Customer | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (query.trim()) params.set("q", query.trim());
    const res = await fetch(`/api/admin/customers?${params}`);
    const data = await res.json();
    setCustomers(data.rows ?? []);
    setTotal(data.total ?? 0);
    setPages(data.pages ?? 1);
    setLoading(false);
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && impersonateTarget && !impersonating) {
        setImpersonateTarget(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [impersonateTarget, impersonating]);

  const handleOpenImpersonate = (customer: Customer) => {
    setImpersonateTarget(customer);
    setImpersonateError("");
  };

  const handleConfirmImpersonate = async () => {
    if (!impersonateTarget) return;
    setImpersonating(true);
    setImpersonateError("");

    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ customerId: impersonateTarget.id }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setImpersonateError(data.error || "Failed to start impersonation session");
        setImpersonating(false);
        return;
      }

      // Navigate straight into the user's customer portal account
      window.location.href = data.redirectTo || "/portal";
    } catch (err: any) {
      setImpersonateError(err?.message || "Network error while connecting to account");
      setImpersonating(false);
    }
  };

  const btnSecondary: React.CSSProperties = {
    background: "var(--border-subtle)",
    color: "var(--text-dim)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "8px",
    padding: "4px 12px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <AdminLayout title="Users & Customers" subtitle="Verified user accounts bridged from Central Identity">
      {/* Search and summary */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, phone, user ID…"
            style={{ ...inputStyle, width: "320px" }}
          />
          <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>{total} users found</span>
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          border: "1px solid rgba(148,163,184,0.1)",
          borderRadius: "12px",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
              {["Name", "Email", "Type", "KYC", "Numbers", "Orders", "Wallets", "Status", "Joined", "Action"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "10px 14px",
                    textAlign: h === "Action" ? "center" : "left",
                    color: "var(--text-dim)",
                    fontWeight: 600,
                    fontSize: "11px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                  Loading users…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "60px", color: "var(--text-dim)" }}>
                  <div>No users found</div>
                  <div style={{ fontSize: "12px", marginTop: "6px" }}>
                    Customers are created automatically when a verified user completes a search
                  </div>
                </td>
              </tr>
            ) : (
              customers.map((c, i) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: "1px solid rgba(148,163,184,0.06)",
                    background: i % 2 === 0 ? "#ffffff" : "var(--bg-card-hover)",
                  }}
                >
                  <td style={{ padding: "10px 14px", color: "var(--text-main)", fontWeight: 500 }}>
                    {c.fullName}
                    {c.companyName && (
                      <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{c.companyName}</div>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", fontSize: "12px" }}>
                    {c.email}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background:
                          c.customerType === "INDIVIDUAL"
                            ? "var(--sky-blue-light)"
                            : "var(--amber-light)",
                        color: c.customerType === "INDIVIDUAL" ? "var(--sky-blue)" : "var(--amber)",
                      }}
                    >
                      {c.customerType}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    {c.kycVerifiedAt ? (
                      <span style={{ color: "var(--emerald)", fontSize: "11px" }}>
                        ✓ {new Date(c.kycVerifiedAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", textAlign: "center" }}>
                    {c._count?.numbers ?? 0}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", textAlign: "center" }}>
                    {c._count?.orders ?? 0}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", textAlign: "center" }}>
                    {c._count?.wallets ?? 0}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        background: c.isActive
                          ? "var(--emerald-light)"
                          : "var(--rose-light)",
                        color: c.isActive ? "var(--emerald)" : "var(--rose)",
                      }}
                    >
                      {c.isActive ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", fontSize: "11px" }}>
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  {/* Separate Impersonate Action Column */}
                  <td style={{ padding: "10px 14px", textAlign: "center", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => handleOpenImpersonate(c)}
                      title={`Login directly as ${c.fullName} without password`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background:
                          "var(--rose-light)",
                        color: "var(--rose)",
                        border: "1px solid rgba(239, 68, 68, 0.35)",
                        borderRadius: "6px",
                        padding: "5px 12px",
                        fontSize: "11.5px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "var(--rose-light)";
                        e.currentTarget.style.borderColor = "var(--rose-border)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "var(--rose-light)";
                        e.currentTarget.style.borderColor = "var(--rose-border)";
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                      <span>Login Customer</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {pages > 1 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              padding: "12px 16px",
              alignItems: "center",
              justifyContent: "flex-end",
              borderTop: "1px solid rgba(148,163,184,0.08)",
            }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={btnSecondary}
            >
              ←
            </button>
            <span style={{ color: "var(--text-dim)", fontSize: "13px" }}>
              {page} / {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              style={btnSecondary}
            >
              →
            </button>
          </div>
        )}
      </div>

      {/* Impersonation Confirmation Modal (Matches Filament Impersonate standard) */}
      {impersonateTarget && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(6px)",
            zIndex: 100000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !impersonating) {
              setImpersonateTarget(null);
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "500px",
              background: "#ffffff",
              border: "1px solid var(--border-medium)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(15, 23, 42, 0.12)",
              padding: "24px",
              color: "var(--text-main)",
            }}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--rose)",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "var(--text-heading)" }}>
                    Login as Customer
                  </h3>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      background: "#fff1f2",
                      color: "#b91c1c",
                      border: "1px solid #fecaca",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Admin Impersonation
                  </span>
                </div>
                <p style={{ margin: "4px 0 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                  Log in to this user&apos;s customer account without needing their password.
                </p>
              </div>
            </div>

            {/* Official Description & Warning Callout */}
            <div
              style={{
                background: "#fff1f2",
                border: "1px solid #fecaca",
                borderRadius: "10px",
                padding: "12px 14px",
                marginBottom: "16px",
                fontSize: "12.5px",
                lineHeight: "1.5",
                color: "#7f1d1d",
              }}
            >
              <strong style={{ color: "#991b1b" }}>Notice: </strong>
              This action grants full access to another user account and is intended strictly for
              authorized debugging or support purposes. Never use it to impersonate a user without
              explicit permission.
            </div>

            {/* Target Account Summary */}
            <div
              style={{
                background: "var(--bg-beige-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "12px 16px",
                marginBottom: "18px",
                fontSize: "12.5px",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "8px 12px" }}>
                <span style={{ color: "var(--text-dim)" }}>Target User:</span>
                <span style={{ color: "var(--text-heading)", fontWeight: 600 }}>{impersonateTarget.fullName}</span>

                <span style={{ color: "var(--text-dim)" }}>Email:</span>
                <span style={{ color: "var(--sky-blue)" }}>{impersonateTarget.email}</span>

                <span style={{ color: "var(--text-dim)" }}>Account Type:</span>
                <span style={{ color: "var(--text-main)" }}>{impersonateTarget.customerType}</span>

                {impersonateTarget.phoneNumber && (
                  <>
                    <span style={{ color: "var(--text-dim)" }}>Phone:</span>
                    <span style={{ color: "var(--text-muted)" }}>{impersonateTarget.phoneNumber}</span>
                  </>
                )}

                <span style={{ color: "var(--text-dim)" }}>Status:</span>
                <span
                  style={{
                    color: impersonateTarget.isActive ? "#059669" : "#dc2626",
                    fontWeight: 600,
                  }}
                >
                  {impersonateTarget.isActive ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>
            </div>

            {/* Error Message if any */}
            {impersonateError && (
              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fca5a5",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  fontSize: "12.5px",
                  color: "#7f1d1d",
                }}
              >
                ⚠️ {impersonateError}
              </div>
            )}

            {/* Inactive account warning if applicable */}
            {!impersonateTarget.isActive && (
              <div
                style={{
                  background: "#fff1f2",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "#7f1d1d",
                }}
              >
                ⚠️ <strong>Account Inactive:</strong> This user cannot be impersonated while their account is inactive. Please activate their account first.
              </div>
            )}

            {/* Banner Notice */}
            <div
              style={{
                fontSize: "11.5px",
                color: "var(--text-dim)",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                A leave banner will appear at the top allowing you to return to Admin at any time.
              </span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setImpersonateTarget(null)}
                disabled={impersonating}
                style={{
                  background: "var(--bg-beige)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: impersonating ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmImpersonate}
                disabled={impersonating || !impersonateTarget.isActive}
                style={{
                  background: !impersonateTarget.isActive
                    ? "rgba(148, 163, 184, 0.2)"
                    : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                  color: !impersonateTarget.isActive ? "var(--text-dim)" : "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: impersonating || !impersonateTarget.isActive ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: !impersonateTarget.isActive ? "none" : "0 4px 14px rgba(239, 68, 68, 0.4)",
                  opacity: impersonating ? 0.75 : 1,
                }}
              >
                {impersonating ? (
                  <>
                    <span
                      style={{
                        width: "12px",
                        height: "12px",
                        border: "2px solid #ffffff",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <span>Connecting…</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Login Customer</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
