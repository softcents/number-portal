"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  expiresAt: string | null;
  createdAt: string;
  customer: {
    id: string;
    fullName: string;
    email: string;
    phoneNumber: string | null;
  };
  items: Array<{
    id: string;
    salePrice: number;
    status: string;
    number: {
      id: string;
      number: string;
      displayCompany?: { code: string; name: string };
    };
  }>;
  payments: Array<{
    id: string;
    gateway: string;
    amount: number;
    status: string;
    paidAt: string | null;
    gatewayTransactionId: string | null;
  }>;
}

const STATUS_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  PENDING: { bg: "rgba(245, 158, 11, 0.12)", text: "var(--amber)", border: "rgba(245, 158, 11, 0.3)" },
  PAID: { bg: "rgba(16, 185, 129, 0.12)", text: "var(--emerald)", border: "rgba(16, 185, 129, 0.3)" },
  PROCESSING: { bg: "rgba(59, 130, 246, 0.12)", text: "var(--sky-blue)", border: "rgba(59, 130, 246, 0.3)" },
  CANCELLED: { bg: "rgba(239, 68, 68, 0.12)", text: "var(--rose)", border: "rgba(239, 68, 68, 0.3)" },
  EXPIRED: { bg: "rgba(148, 163, 184, 0.12)", text: "var(--text-dim)", border: "rgba(148, 163, 184, 0.3)" },
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [metrics, setMetrics] = useState<any>({ totalOrders: 0, statusCounts: {}, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (statusFilter !== "ALL") q.set("status", statusFilter);
      if (search.trim()) q.set("search", search.trim());
      q.set("page", String(page));
      q.set("limit", "20");

      const res = await fetch(`/api/admin/orders?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch (e) {
      console.error("Failed to fetch admin orders:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  const handleMarkPaid = async (orderId: string) => {
    if (!confirm("Are you sure you want to mark this order as PAID? This will automatically activate all reserved numbers and create their wallets.")) {
      return;
    }

    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Admin manual verification" }),
      });

      if (res.ok) {
        await fetchOrders();
      } else {
        const err = await res.json();
        alert(`Failed: ${err.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert(`Error: ${e?.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm("Cancel this order and release reserved numbers back to available inventory?")) {
      return;
    }

    setActionLoadingId(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled by administrator" }),
      });

      if (res.ok) {
        await fetchOrders();
      } else {
        const err = await res.json();
        alert(`Failed: ${err.error || "Unknown error"}`);
      }
    } catch (e: any) {
      alert(`Error: ${e?.message}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <AdminLayout title="Orders & Reservations" subtitle="Manage number sales, PipraPay payments, and reservation lifecycles">
      {/* Metric Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "14px",
          marginBottom: "24px",
        }}
      >
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Total Orders</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--text-heading)" }}>{metrics.totalOrders || 0}</div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Pending Reservations</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#d97706" }}>{metrics.statusCounts?.PENDING || 0}</div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Completed (Paid)</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#059669" }}>{metrics.statusCounts?.PAID || 0}</div>
        </div>

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>Total Revenue</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#059669" }}>৳ {Number(metrics.totalRevenue || 0).toLocaleString()} BDT</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          marginBottom: "20px",
          padding: "16px",
          background: "var(--bg-card)",
          borderRadius: "12px",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {/* Status filter pills */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {["ALL", "PENDING", "PAID", "CANCELLED", "EXPIRED"].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setPage(1);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 600,
                background: statusFilter === st ? "var(--sky-indigo)" : "var(--bg-beige)",
                color: statusFilter === st ? "#ffffff" : "var(--text-main)",
                border: statusFilter === st ? "1px solid transparent" : "1px solid var(--border-subtle)",
                cursor: "pointer",
              }}
            >
              {st} {metrics.statusCounts?.[st] !== undefined && `(${metrics.statusCounts[st]})`}
            </button>
          ))}
        </div>

        {/* Search form */}
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            placeholder="Search order #, customer, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "7px 12px",
              background: "#ffffff",
              border: "1px solid var(--border-medium)",
              borderRadius: "8px",
              color: "var(--text-main)",
              fontSize: "13px",
              outline: "none",
              minWidth: "240px",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "7px 14px",
              background: "var(--sky-indigo)",
              border: "none",
              borderRadius: "8px",
              color: "#ffffff",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Search
          </button>
        </form>
      </div>

      {/* Orders Table */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "var(--bg-beige-subtle)", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Order #</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Customer</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Numbers</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Total (BDT)</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    No orders found matching the criteria.
                  </td>
                </tr>
              ) : (
                orders.map((ord) => {
                  const badge = STATUS_BADGES[ord.status] || STATUS_BADGES.EXPIRED;
                  const isActionLoading = actionLoadingId === ord.id;

                  return (
                    <tr
                      key={ord.id}
                      style={{ borderBottom: "1px solid var(--border-subtle)", transition: "background 0.1s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-beige-subtle)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <Link
                          href={`/admin/orders/${ord.id}`}
                          style={{ fontFamily: "monospace", color: "var(--sky-blue)", fontWeight: 600, textDecoration: "none" }}
                        >
                          {ord.orderNumber}
                        </Link>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>{ord.customer?.fullName || "Guest"}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{ord.customer?.email}</div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {ord.items?.map((it) => (
                            <span
                              key={it.id}
                              style={{
                                fontFamily: "monospace",
                                fontSize: "11.5px",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: "var(--bg-beige)",
                                border: "1px solid var(--border-subtle)",
                                color: "var(--text-main)",
                              }}
                            >
                              {it.number?.number}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#059669" }}>
                        ৳ {Number(ord.totalAmount).toFixed(2)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "999px",
                            background: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                          }}
                        >
                          {ord.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: "12px" }}>
                        {new Date(ord.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                          <Link
                            href={`/admin/orders/${ord.id}`}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: "var(--bg-beige)",
                              color: "var(--text-muted)",
                              fontSize: "11.5px",
                              textDecoration: "none",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            Detail
                          </Link>

                          {ord.status === "PENDING" && (
                            <>
                              <button
                                onClick={() => handleMarkPaid(ord.id)}
                                disabled={isActionLoading}
                                title="Mark Paid & Activate Numbers"
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  background: "var(--emerald-light)",
                                  color: "#059669",
                                  fontSize: "11.5px",
                                  fontWeight: 600,
                                  border: "1px solid var(--emerald-border)",
                                  cursor: "pointer",
                                }}
                              >
                                Mark Paid
                              </button>
                              <button
                                onClick={() => handleCancelOrder(ord.id)}
                                disabled={isActionLoading}
                                title="Cancel Order & Release Numbers"
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "6px",
                                  background: "#fff1f2",
                                  color: "#dc2626",
                                  fontSize: "11.5px",
                                  border: "1px solid #fca5a5",
                                  cursor: "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
