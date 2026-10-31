"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchOrderDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`);
      if (res.ok) {
        const data = await res.json();
        setOrder(data.order);
      } else {
        setError("Order not found");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderDetail();
  }, [id]);

  const handleMarkPaid = async () => {
    if (!confirm("Confirm marking this order as PAID? All reserved numbers will become ACTIVE and wallets will be initialized.")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Manual admin verification" }),
      });
      if (res.ok) {
        await fetchOrderDetail();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || "Failed to mark paid"}`);
      }
    } catch (e: any) {
      alert(`Error: ${e?.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!confirm("Cancel this order and release numbers back to available inventory?")) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Admin cancelled from detail view" }),
      });
      if (res.ok) {
        await fetchOrderDetail();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || "Failed to cancel"}`);
      }
    } catch (e: any) {
      alert(`Error: ${e?.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AdminLayout title="Order Details" subtitle={`Inspecting ${order?.orderNumber || "Order"}`}>
      <div style={{ marginBottom: "20px" }}>
        <Link
          href="/admin/orders"
          style={{
            fontSize: "13px",
            color: "var(--text-dim)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          ← Back to Orders
        </Link>
      </div>

      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-dim)" }}>Loading order details...</div>
      ) : error || !order ? (
        <div style={{ padding: "40px", textAlign: "center", color: "var(--rose)" }}>{error || "Order not found"}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
          {/* Main Left Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Order Overview Header Card */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                padding: "24px",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: "20px", fontWeight: 700, color: "var(--text-heading)" }}>
                    {order.orderNumber}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Created on {new Date(order.createdAt).toLocaleString()}
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "4px 12px",
                      borderRadius: "999px",
                      background:
                        order.status === "PAID"
                          ? "var(--emerald-light)"
                          : order.status === "PENDING"
                          ? "var(--amber-light)"
                          : "#fff1f2",
                      color:
                        order.status === "PAID"
                          ? "#059669"
                          : order.status === "PENDING"
                          ? "#b45309"
                          : "#dc2626",
                    }}
                  >
                    {order.status}
                  </span>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#059669", marginTop: "8px" }}>
                    ৳ {Number(order.totalAmount).toFixed(2)} BDT
                  </div>
                </div>
              </div>

              {order.status === "PENDING" && (
                <div style={{ display: "flex", gap: "10px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
                  <button
                    onClick={handleMarkPaid}
                    disabled={actionLoading}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "8px",
                      background: "#059669",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    ✓ Mark as Paid & Activate
                  </button>
                  <button
                    onClick={handleCancelOrder}
                    disabled={actionLoading}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "8px",
                      background: "#fff1f2",
                      color: "#dc2626",
                      fontSize: "13px",
                      border: "1px solid #fca5a5",
                      cursor: "pointer",
                    }}
                  >
                    ✕ Cancel Order & Release
                  </button>
                </div>
              )}
            </div>

            {/* Ordered Items Table */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                padding: "24px",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 16px 0", color: "var(--text-heading)" }}>
                Order Items ({order.items?.length || 0})
              </h3>
              <div style={{ display: "grid", gap: "12px" }}>
                {order.items?.map((item: any) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px",
                      borderRadius: "10px",
                      background: "var(--bg-beige-subtle)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Link
                          href={`/admin/numbers/${item.number?.id}`}
                          style={{
                            fontFamily: "monospace",
                            fontSize: "15px",
                            fontWeight: 700,
                            color: "var(--sky-blue)",
                            textDecoration: "none",
                          }}
                        >
                          {item.number?.number}
                        </Link>
                        <span
                          style={{
                            fontSize: "10.5px",
                            padding: "2px 8px",
                            borderRadius: "6px",
                            background: "var(--sky-light)",
                            color: "var(--sky-blue)",
                          }}
                        >
                          {item.number?.displayCompany?.code || "09639"}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "4px" }}>
                        Number status: <strong style={{ color: "var(--text-main)" }}>{item.number?.status}</strong>
                        {item.failureReason && (
                          <span style={{ color: "var(--rose)", marginLeft: "8px" }}>
                            ({item.failureReason})
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#059669" }}>
                        ৳ {Number(item.salePrice).toFixed(2)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "4px",
                            background:
                              item.status === "COMPLETED"
                                ? "var(--emerald-light)"
                                : item.status === "PROCESSING"
                                ? "var(--sky-light)"
                                : item.status === "FAILED"
                                ? "#fff1f2"
                                : "var(--bg-beige-subtle)",
                            color:
                              item.status === "COMPLETED"
                                ? "#059669"
                                : item.status === "PROCESSING"
                                ? "var(--sky-blue)"
                                : item.status === "FAILED"
                                ? "#dc2626"
                                : "var(--text-muted)",
                          }}
                        >
                          {item.status}
                        </span>

                        {item.status === "FAILED" && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/admin/orders/items/${item.id}/retry`, {
                                  method: "POST",
                                });
                                if (res.ok) {
                                  alert("Activation retry initiated");
                                  fetchOrderDetail();
                                } else {
                                  const err = await res.json();
                                  alert(err.error || "Failed to retry activation");
                                }
                              } catch (e: any) {
                                alert(e?.message);
                              }
                            }}
                            style={{
                              padding: "2px 8px",
                              fontSize: "11px",
                              fontWeight: 600,
                              borderRadius: "4px",
                              background: "#fff1f2",
                              border: "1px solid #fca5a5",
                              color: "#dc2626",
                              cursor: "pointer",
                            }}
                          >
                            ⚡ Retry
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Logs */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                padding: "24px",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 16px 0", color: "var(--text-heading)" }}>
                Payment Transactions ({order.payments?.length || 0})
              </h3>
              {order.payments?.length === 0 ? (
                <div style={{ color: "var(--text-dim)", fontSize: "13px" }}>No payments initiated yet.</div>
              ) : (
                <div style={{ display: "grid", gap: "12px" }}>
                  {order.payments?.map((pay: any) => (
                    <div
                      key={pay.id}
                      style={{
                        padding: "14px",
                        borderRadius: "10px",
                        background: "var(--bg-beige-subtle)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-heading)" }}>
                          Gateway: {pay.gateway}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background:
                              pay.status === "COMPLETED"
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(245, 158, 11, 0.15)",
                            color: pay.status === "COMPLETED" ? "var(--emerald)" : "var(--amber)",
                          }}
                        >
                          {pay.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Transaction ID: {pay.gatewayTransactionId || "N/A"} • Amount: ৳
                        {Number(pay.amount).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Customer Details */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                padding: "20px",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 14px 0", color: "var(--text-heading)" }}>
                Customer Information
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>Full Name</div>
                  <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>{order.customer?.fullName}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>Email</div>
                  <div style={{ color: "var(--text-main)" }}>{order.customer?.email}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>Phone Number</div>
                  <div style={{ color: "var(--text-main)" }}>{order.customer?.phoneNumber || "N/A"}</div>
                </div>
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>Central Identity ID</div>
                  <div style={{ fontFamily: "monospace", fontSize: "11.5px", color: "var(--text-dim)" }}>
                    {order.customer?.centralIdentityUserId}
                  </div>
                </div>
              </div>
            </div>

            {/* Status History Timeline */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                padding: "20px",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 14px 0", color: "var(--text-heading)" }}>
                Status Transition Timeline
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {order.statusHistory?.map((h: any, idx: number) => (
                  <div key={h.id} style={{ display: "flex", gap: "10px", fontSize: "12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          background: idx === 0 ? "var(--sky-indigo)" : "var(--text-dim)",
                        }}
                      />
                      {idx < order.statusHistory.length - 1 && (
                        <div style={{ width: "1px", flex: 1, background: "var(--border-subtle)", margin: "4px 0" }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>
                        {h.fromStatus ? `${h.fromStatus} → ` : ""}
                        {h.toStatus}
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                        By {h.changedBy} • {new Date(h.createdAt).toLocaleString()}
                      </div>
                      {h.reason && <div style={{ color: "var(--text-muted)", fontSize: "11.5px", marginTop: "2px" }}>{h.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
