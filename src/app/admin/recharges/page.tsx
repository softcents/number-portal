"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";

interface RechargeTx {
  id: string;
  phone: string;
  amount: number;
  status: string;
  reason: string | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  durationMs: number | null;
  reference: string | null;
  idempotencyKey: string | null;
  jobId: string | null;
  createdAt: string;
  completedAt: string | null;
  customerName: string;
  customerEmail: string;
  network: string;
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; border: string }> = {
  DONE: { bg: "var(--emerald-light)", color: "var(--emerald)", border: "var(--emerald-border)" },
  UNCERTAIN: { bg: "var(--amber-light)", color: "var(--amber)", border: "var(--amber-border)" },
  ERROR: { bg: "var(--rose-light)", color: "var(--rose)", border: "var(--rose-border)" },
  PENDING: { bg: "var(--sky-blue-light)", color: "var(--primary)", border: "rgba(2, 132, 199, 0.3)" },
};

export default function AdminRechargesPage() {
  const [rows, setRows] = useState<RechargeTx[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/admin/recharges?${params}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch (e) {
      console.error("Failed to fetch recharges:", e);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const handleRetry = async (txId: string) => {
    if (!confirm("Are you sure you want to re-run the recharge for this transaction?")) return;
    setRetryingId(txId);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/recharges/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage({ text: data.error || "Failed to retry recharge", error: true });
      } else {
        setActionMessage({ text: data.message || "Recharge successfully re-dispatched to worker!", error: false });
        await load();
      }
    } catch (err: any) {
      setActionMessage({ text: err?.message || "Network error while retrying recharge", error: true });
    } finally {
      setRetryingId(null);
    }
  };

  const uncertainCount = rows.filter((r) => r.status === "UNCERTAIN").length;
  const doneCount = rows.filter((r) => r.status === "DONE").length;
  const totalVolume = rows
    .filter((r) => r.status === "DONE")
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <AdminLayout
      title="Top Up & Recharge Transactions"
      subtitle="Audit trail and reconciliation for automated phone recharges across providers"
    >
      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            borderRadius: "8px",
            background: actionMessage.error ? "var(--rose-light)" : "var(--emerald-light)",
            border: `1px solid ${actionMessage.error ? "var(--rose-border)" : "var(--emerald-border)"}`,
            color: actionMessage.error ? "var(--rose)" : "var(--emerald)",
            fontSize: "13px",
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Total Attempts", val: total, color: "var(--primary)" },
          { label: "Successful Volume", val: `৳${totalVolume.toFixed(2)}`, color: "var(--emerald)" },
          { label: "Successful Top Ups", val: doneCount, color: "var(--emerald)" },
          {
            label: "Needs Review (Uncertain)",
            val: uncertainCount,
            color: uncertainCount > 0 ? "var(--amber)" : "var(--text-dim)",
            highlight: uncertainCount > 0,
          },
        ].map(({ label, val, color, highlight }) => (
          <div
            key={label}
            style={{
              background: highlight ? "var(--amber-light)" : "#ffffff",
              border: highlight
                ? "1px solid var(--amber-border)"
                : "1px solid var(--border-subtle)",
              borderRadius: "10px",
              padding: "14px 20px",
              minWidth: "160px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
            }}
          >
            <div style={{ fontSize: "22px", fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: "11px", color: highlight ? "var(--amber)" : "var(--text-dim)", marginTop: "3px", fontWeight: 500 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {["ALL", "DONE", "UNCERTAIN", "ERROR", "PENDING"].map((s) => {
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "5px 14px",
                borderRadius: "999px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: isActive ? "var(--sky-indigo)" : "#ffffff",
                color: isActive ? "#ffffff" : "var(--text-main)",
                border: isActive ? "1px solid transparent" : "1px solid var(--border-subtle)",
                boxShadow: isActive ? "0 2px 8px rgba(2, 132, 199, 0.25)" : "0 1px 2px rgba(15,23,42,0.03)",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              {s === "UNCERTAIN" && "⚠️ "}
              {s}
            </button>
          );
        })}
      </div>

      {/* Main Table */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-beige-subtle)" }}>
                {[
                  "Phone",
                  "Customer",
                  "Amount",
                  "Before → After",
                  "Status",
                  "Reason / Ref",
                  "Timing",
                  "Created",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 14px",
                      textAlign: "left",
                      color: "var(--text-dim)",
                      fontWeight: 700,
                      fontSize: "11px",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
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
                  <td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
                    Loading transactions…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", padding: "60px", color: "var(--text-dim)" }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-main)" }}>No recharge transactions found</div>
                    <div style={{ fontSize: "12px", marginTop: "6px", color: "var(--text-muted)" }}>
                      Attempts from the user portal Top Up button appear here
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((tx, idx) => {
                  const cfg = STATUS_CONFIG[tx.status] ?? {
                    bg: "var(--bg-beige)",
                    color: "var(--text-dim)",
                    border: "var(--border-subtle)",
                  };
                  const isUncertain = tx.status === "UNCERTAIN";

                  return (
                    <tr
                      key={tx.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        background: isUncertain ? "var(--amber-light)" : idx % 2 === 0 ? "#ffffff" : "var(--bg-card-hover)",
                      }}
                    >
                      {/* Phone */}
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-main)" }}>
                          {tx.phone}
                        </span>
                        <div style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>{tx.network}</div>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ color: "var(--text-heading)", fontWeight: 600 }}>{tx.customerName}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>{tx.customerEmail}</div>
                      </td>

                      {/* Amount */}
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "var(--text-purple)" }}>
                        ৳{tx.amount.toFixed(2)}
                      </td>

                      {/* Balance Before -> After */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {tx.balanceBefore !== null && tx.balanceAfter !== null ? (
                          <span>
                            <span style={{ color: "var(--text-dim)" }}>৳{tx.balanceBefore.toFixed(2)}</span>
                            <span style={{ margin: "0 6px", color: "var(--text-dim)" }}>→</span>
                            <span style={{ color: "var(--emerald)", fontWeight: 700 }}>
                              ৳{tx.balanceAfter.toFixed(2)}
                            </span>
                          </span>
                        ) : tx.balanceBefore !== null ? (
                          <span style={{ color: "var(--text-dim)" }}>৳{tx.balanceBefore.toFixed(2)}</span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: "999px",
                            background: cfg.bg,
                            color: cfg.color,
                            border: `1px solid ${cfg.border}`,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {isUncertain && "⚠️ "}
                          {tx.status}
                        </span>
                      </td>

                      {/* Reason / Reference */}
                      <td style={{ padding: "12px 14px", maxWidth: "200px" }}>
                        {tx.reason ? (
                          <span
                            style={{
                              fontSize: "11.5px",
                              color: isUncertain ? "var(--amber)" : "var(--rose)",
                              fontFamily: "monospace",
                              fontWeight: 500,
                            }}
                          >
                            {tx.reason}
                          </span>
                        ) : tx.reference ? (
                          <span style={{ fontSize: "11.5px", color: "var(--text-dim)", fontFamily: "monospace" }}>
                            {tx.reference}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-dim)" }}>—</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td style={{ padding: "12px 14px", color: "var(--text-dim)", fontSize: "11.5px" }}>
                        {tx.durationMs ? `${(tx.durationMs / 1000).toFixed(2)}s` : "—"}
                      </td>

                      {/* Created At */}
                      <td style={{ padding: "12px 14px", color: "var(--text-dim)", fontSize: "11px", whiteSpace: "nowrap" }}>
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                        {(tx.status === "ERROR" || tx.status === "UNCERTAIN") ? (
                          <button
                            disabled={retryingId === tx.id}
                            onClick={() => handleRetry(tx.id)}
                            style={{
                              background: "var(--amber-light)",
                              border: "1px solid var(--amber-border)",
                              color: "var(--amber)",
                              fontSize: "11px",
                              fontWeight: 600,
                              padding: "4px 10px",
                              borderRadius: "6px",
                              cursor: retryingId === tx.id ? "not-allowed" : "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {retryingId === tx.id ? "Retrying…" : "Retry Recharge"}
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--border-subtle)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "12px",
              color: "var(--text-main)",
              background: "var(--bg-beige-subtle)",
            }}
          >
            <span style={{ fontWeight: 500 }}>
              Page {page} of {pages} ({total} items)
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  background: "#ffffff",
                  color: page <= 1 ? "var(--text-dim)" : "var(--text-main)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
                }}
              >
                ← Previous
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                style={{
                  background: "#ffffff",
                  color: page >= pages ? "var(--text-dim)" : "var(--text-main)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "6px",
                  padding: "6px 12px",
                  cursor: page >= pages ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
