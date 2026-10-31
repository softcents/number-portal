"use client";

import React, { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";

interface PaymentItem {
  id: string;
  amount: number;
  currency: string;
  gateway: string;
  gatewayPaymentId: string | null;
  gatewayTransactionId: string | null;
  status: string;
  verificationStatus: string;
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
  order?: {
    id: string;
    orderNumber: string;
    totalAmount: number;
  };
  auditLogs?: Array<{
    id: string;
    oldStatus: string | null;
    newStatus: string;
    action: string;
    reason: string | null;
    adminId: string | null;
    createdAt: string;
  }>;
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  COMPLETED: { bg: "rgba(16, 185, 129, 0.12)", color: "var(--emerald)", border: "rgba(16, 185, 129, 0.25)" },
  PENDING: { bg: "rgba(245, 158, 11, 0.12)", color: "var(--amber)", border: "rgba(245, 158, 11, 0.25)" },
  FAILED: { bg: "rgba(239, 68, 68, 0.12)", color: "var(--rose)", border: "rgba(239, 68, 68, 0.25)" },
  UNDER_REVIEW: { bg: "rgba(168, 85, 247, 0.12)", color: "#c084fc", border: "rgba(168, 85, 247, 0.25)" },
  REFUNDED: { bg: "rgba(100, 116, 139, 0.15)", color: "var(--text-dim)", border: "rgba(100, 116, 139, 0.25)" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] || { bg: "rgba(100, 116, 139, 0.1)", color: "var(--text-dim)", border: "transparent" };
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        display: "inline-block",
      }}
    >
      {status}
    </span>
  );
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  // Stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [statsMap, setStatsMap] = useState<Record<string, number>>({});

  // Detail / Audit Modal
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);

  // Status Change Modal
  const [editingPayment, setEditingPayment] = useState<PaymentItem | null>(null);
  const [newStatus, setNewStatus] = useState("COMPLETED");
  const [changeReason, setChangeReason] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "25",
      });
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/payments?${params}`);
      const data = await res.json();

      setPayments(data.payments || []);
      setTotal(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 1);

      if (data.stats) {
        let rev = 0;
        const counts: Record<string, number> = {};
        for (const s of data.stats) {
          counts[s.status] = s._count?.id || 0;
          if (s.status === "COMPLETED") {
            rev = Number(s._sum?.amount || 0);
          }
        }
        setTotalRevenue(rev);
        setStatsMap(counts);
      }
    } catch (err) {
      console.error("Failed to load payments:", err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    if (!changeReason.trim()) {
      alert("Please provide an audit reason for changing this payment status.");
      return;
    }

    setIsSubmittingStatus(true);
    try {
      const res = await fetch(`/api/admin/payments/${editingPayment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          reason: changeReason,
          notes: changeNotes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to update payment status");
        return;
      }

      setEditingPayment(null);
      setChangeReason("");
      setChangeNotes("");
      await fetchPayments();
    } catch (err: any) {
      alert(err?.message || "Failed to update status");
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  return (
    <AdminLayout
      title="Payments Management"
      subtitle="Complete financial ledger, gateway verifications, and audit history"
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: "60px" }}>
        {/* Top Metric Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 500 }}>
              Verified Revenue
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#059669",
                marginTop: "6px",
              }}
            >
              ৳ {totalRevenue.toLocaleString()}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
              Settled payments
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 500 }}>
              Total Records
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--text-heading)",
                marginTop: "6px",
              }}
            >
              {total}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
              Permanent audit ledger
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 500 }}>
              Completed
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--emerald)",
                marginTop: "6px",
              }}
            >
              {statsMap["COMPLETED"] || 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
              Successfully paid
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 500 }}>
              Pending
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--amber)",
                marginTop: "6px",
              }}
            >
              {statsMap["PENDING"] || 0}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
              Awaiting checkout
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 500 }}>
              Failed / Under Review
            </div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--rose)",
                marginTop: "6px",
              }}
            >
              {(statsMap["FAILED"] || 0) + (statsMap["UNDER_REVIEW"] || 0)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "4px" }}>
              Requires attention
            </div>
          </div>
        </div>

        {/* Filters and Actions Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
          }}
        >
          {/* Status Filter Tabs */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["ALL", "COMPLETED", "PENDING", "FAILED", "UNDER_REVIEW", "REFUNDED"].map(
              (st) => (
                <button
                  key={st}
                  onClick={() => {
                    setStatusFilter(st);
                    setPage(1);
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border:
                      statusFilter === st
                        ? "1px solid var(--sky-blue)"
                        : "1px solid var(--border-subtle)",
                    background:
                      statusFilter === st
                        ? "var(--sky-light)"
                        : "var(--bg-beige)",
                    color: statusFilter === st ? "var(--sky-blue)" : "var(--text-muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {st === "ALL" ? "All Payments" : st}
                </button>
              )
            )}
          </div>

          <button
            onClick={() => fetchPayments()}
            style={{
              padding: "7px 16px",
              borderRadius: "8px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              background: "var(--bg-beige)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Payments Table */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            overflow: "hidden",
            boxShadow: "0 2px 12px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: "13px",
              }}
            >
              <thead>
                <tr
                   style={{
                    background: "var(--bg-beige-subtle)",
                    borderBottom: "1px solid var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>ID / Order</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Amount</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Gateway</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Transaction ID</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Verification</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600 }}>Date</th>
                  <th style={{ padding: "14px 18px", fontWeight: 600, textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                      Loading payment records...
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)" }}>
                      No payments found matching the selected filter.
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr
                      key={p.id}
                      style={{
                      borderBottom: "1px solid var(--border-subtle)",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-beige-subtle)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--text-heading)" }}>
                          {p.id.slice(0, 12)}...
                        </div>
                        {p.order ? (
                          <div style={{ fontSize: "11px", color: "var(--sky-blue)", marginTop: "2px" }}>
                            Ord: {p.order.orderNumber}
                          </div>
                        ) : (
                          <div style={{ fontSize: "11px", color: "var(--indigo)", marginTop: "2px" }}>
                            Wallet Recharge
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--text-heading)" }}>
                        ৳ {Number(p.amount).toLocaleString()}
                        <span style={{ fontSize: "10px", color: "var(--text-dim)", marginLeft: "4px" }}>
                          {p.currency}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-main)" }}>
                        <span
                          style={{
                            background: "var(--bg-beige-subtle)",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                          }}
                        >
                          {p.gateway}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", fontFamily: "monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                        {p.gatewayTransactionId || p.gatewayPaymentId || "—"}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <StatusBadge status={p.status} />
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: p.verificationStatus === "VERIFIED" ? "var(--emerald)" : "var(--amber)",
                          }}
                        >
                          {p.verificationStatus}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", fontSize: "11px", color: "var(--text-muted)" }}>
                        {new Date(p.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button
                            onClick={() => setSelectedPayment(p)}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              background: "var(--bg-beige)",
                              border: "1px solid var(--border-subtle)",
                              color: "var(--text-muted)",
                            }}
                          >
                            Audit
                          </button>
                          <button
                            onClick={() => {
                              setEditingPayment(p);
                              setNewStatus(p.status === "PENDING" ? "COMPLETED" : p.status);
                              setChangeReason("");
                              setChangeNotes("");
                            }}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              background: "rgba(59, 130, 246, 0.15)",
                              border: "1px solid rgba(59, 130, 246, 0.3)",
                              color: "var(--sky-blue)",
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 20px",
                borderTop: "1px solid rgba(148, 163, 184, 0.12)",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              <span>
                Page {page} of {totalPages} ({total} total)
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "6px",
                    background: "var(--bg-beige)",
                    color: page <= 1 ? "var(--text-dim)" : "var(--text-main)",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: "4px 12px",
                    borderRadius: "6px",
                    background: "var(--bg-beige)",
                    color: page >= totalPages ? "var(--text-dim)" : "var(--text-main)",
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Audit Details Modal */}
        {selectedPayment && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
            onClick={() => setSelectedPayment(null)}
          >
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-medium)",
                borderRadius: "14px",
                width: "min(640px, 95vw)",
                maxHeight: "85vh",
                overflowY: "auto",
                padding: "24px",
                boxShadow: "0 8px 32px rgba(15, 23, 42, 0.12)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "18px",
                }}
              >
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-heading)", margin: 0 }}>
                    Payment Audit & Event Trail
                  </h3>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "monospace" }}>
                    ID: {selectedPayment.id}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPayment(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "20px",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  background: "var(--bg-beige-subtle)",
                  padding: "14px",
                  borderRadius: "10px",
                  marginBottom: "20px",
                  fontSize: "12px",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-dim)" }}>Amount: </span>
                  <strong style={{ color: "var(--text-heading)" }}>
                    ৳ {Number(selectedPayment.amount).toLocaleString()} {selectedPayment.currency}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-dim)" }}>Current Status: </span>
                  <StatusBadge status={selectedPayment.status} />
                </div>
                <div>
                  <span style={{ color: "var(--text-dim)" }}>Gateway: </span>
                  <span style={{ color: "var(--text-main)" }}>{selectedPayment.gateway}</span>
                </div>
                <div>
                  <span style={{ color: "var(--text-dim)" }}>Transaction: </span>
                  <span style={{ color: "var(--text-main)", fontFamily: "monospace" }}>
                    {selectedPayment.gatewayTransactionId || "N/A"}
                  </span>
                </div>
              </div>

              <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", marginBottom: "12px" }}>
                Audit Log Entries ({selectedPayment.auditLogs?.length || 0})
              </h4>

              {(!selectedPayment.auditLogs || selectedPayment.auditLogs.length === 0) ? (
                <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>No audit log entries found.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {selectedPayment.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        background: "var(--bg-beige)",
                        border: "1px solid rgba(148, 163, 184, 0.1)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <span style={{ fontWeight: 600, color: "var(--sky-blue)" }}>{log.action}</span>
                        <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ color: "var(--text-main)" }}>
                        Transition:{" "}
                        <span style={{ color: "var(--text-muted)" }}>{log.oldStatus || "INITIAL"}</span> →{" "}
                        <strong style={{ color: "#059669" }}>{log.newStatus}</strong>
                      </div>
                      {log.reason && (
                        <div style={{ color: "var(--text-muted)", fontSize: "11px", marginTop: "4px" }}>
                          Reason: {log.reason}
                        </div>
                      )}
                      {log.adminId && (
                        <div style={{ color: "var(--text-dim)", fontSize: "10px", marginTop: "2px" }}>
                          Operator: {log.adminId}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Change Status Modal */}
        {editingPayment && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(15, 23, 42, 0.45)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
            onClick={() => setEditingPayment(null)}
          >
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-medium)",
                borderRadius: "14px",
                width: "min(500px, 95vw)",
                padding: "24px",
                boxShadow: "0 8px 32px rgba(15, 23, 42, 0.12)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-heading)", marginBottom: "6px" }}>
                Update Payment Status
              </h3>
              <p style={{ fontSize: "12px", color: "var(--text-dim)", marginBottom: "18px" }}>
                Manual status updates require an audit reason and will trigger appropriate downstream actions.
              </p>

              <form onSubmit={handleUpdateStatus}>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--text-dim)", marginBottom: "6px" }}>
                    Target Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1px solid var(--border-medium)",
                      color: "var(--text-main)",
                      fontSize: "13px",
                    }}
                  >
                    <option value="COMPLETED">COMPLETED (Verify & Settle)</option>
                    <option value="PENDING">PENDING (Reset to Pending)</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW (Requires Review)</option>
                    <option value="FAILED">FAILED (Mark Failed)</option>
                    <option value="REFUNDED">REFUNDED (Mark Refunded)</option>
                  </select>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--text-dim)", marginBottom: "6px" }}>
                    Audit Reason <span style={{ color: "var(--rose)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bank deposit slip verified by supervisor"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1px solid var(--border-medium)",
                      color: "var(--text-main)",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px" }}>
                    Internal Reference / Notes (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Transaction reference, receipt number, or bank branch..."
                    value={changeNotes}
                    onChange={(e) => setChangeNotes(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1px solid var(--border-medium)",
                      color: "var(--text-main)",
                      fontSize: "13px",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setEditingPayment(null)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      background: "var(--bg-beige)",
                      color: "var(--text-muted)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingStatus}
                    style={{
                      padding: "8px 18px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#3b82f6",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: isSubmittingStatus ? "not-allowed" : "pointer",
                    }}
                  >
                    {isSubmittingStatus ? "Saving..." : "Save Audit & Update"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
