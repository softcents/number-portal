"use client";

import React, { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";

interface ResellerItem {
  id: string;
  username: string;
  email: string;
  companyName: string;
  brandName: string;
  subdomain: string | null;
  customDomain: string | null;
  phoneNumber: string | null;
  balance: number;
  currency: string;
  numberDiscountPercent: number;
  rechargeDiscountPercent: number;
  status: string;
  createdAt: string;
  _count: {
    customers: number;
    numbers: number;
    rechargeTransactions: number;
    transactions: number;
  };
}

export default function AdminResellersPage() {
  const [resellers, setResellers] = useState<ResellerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState<ResellerItem | null>(null);
  const [showEditModal, setShowEditModal] = useState<ResellerItem | null>(null);

  // Create Form State
  const [newReseller, setNewReseller] = useState({
    companyName: "",
    brandName: "",
    username: "",
    email: "",
    password: "",
    phoneNumber: "",
    subdomain: "",
    numberDiscountPercent: "10",
    rechargeDiscountPercent: "5",
    initialBalance: "0",
    brandColor: "#2563eb",
  });

  // Balance Form State
  const [balanceAction, setBalanceAction] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceNotes, setBalanceNotes] = useState("");
  const [balanceSubmitting, setBalanceSubmitting] = useState(false);

  // Edit Form State
  const [editForm, setEditForm] = useState({
    companyName: "",
    brandName: "",
    email: "",
    phoneNumber: "",
    subdomain: "",
    customDomain: "",
    numberDiscountPercent: "0",
    rechargeDiscountPercent: "0",
    status: "ACTIVE",
    password: "",
  });

  const fetchResellers = async () => {
    setLoading(true);
    try {
      const url = searchQuery
        ? `/api/admin/resellers?q=${encodeURIComponent(searchQuery)}`
        : "/api/admin/resellers";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setResellers(data.resellers || []);
      } else {
        setErrorMsg(data.error || "Failed to load resellers");
      }
    } catch (err: any) {
      setErrorMsg("Network error loading resellers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResellers();
  }, [searchQuery]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/admin/resellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newReseller),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to create reseller");
        return;
      }

      setSuccessMsg("Reseller created successfully!");
      setShowCreateModal(false);
      setNewReseller({
        companyName: "",
        brandName: "",
        username: "",
        email: "",
        password: "",
        phoneNumber: "",
        subdomain: "",
        numberDiscountPercent: "10",
        rechargeDiscountPercent: "5",
        initialBalance: "0",
        brandColor: "#2563eb",
      });
      fetchResellers();
    } catch (err: any) {
      setErrorMsg("Network error creating reseller");
    }
  };

  const handleBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showBalanceModal) return;
    setErrorMsg("");
    setBalanceSubmitting(true);

    try {
      const res = await fetch(`/api/admin/resellers/${showBalanceModal.id}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: balanceAction,
          amount: balanceAmount,
          notes: balanceNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to update balance");
        setBalanceSubmitting(false);
        return;
      }

      setSuccessMsg(data.message || "Balance adjusted successfully");
      setShowBalanceModal(null);
      setBalanceAmount("");
      setBalanceNotes("");
      fetchResellers();
    } catch (err: any) {
      setErrorMsg("Network error updating balance");
    } finally {
      setBalanceSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal) return;
    setErrorMsg("");

    try {
      const res = await fetch(`/api/admin/resellers/${showEditModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to update reseller");
        return;
      }

      setSuccessMsg("Reseller details updated successfully");
      setShowEditModal(null);
      fetchResellers();
    } catch (err: any) {
      setErrorMsg("Network error updating reseller");
    }
  };

  const openEditModal = (r: ResellerItem) => {
    setShowEditModal(r);
    setEditForm({
      companyName: r.companyName,
      brandName: r.brandName,
      email: r.email,
      phoneNumber: r.phoneNumber || "",
      subdomain: r.subdomain || "",
      customDomain: r.customDomain || "",
      numberDiscountPercent: String(r.numberDiscountPercent),
      rechargeDiscountPercent: String(r.rechargeDiscountPercent),
      status: r.status,
      password: "",
    });
  };

  // Metrics calculation
  const totalResellers = resellers.length;
  const activeResellers = resellers.filter((r) => r.status === "ACTIVE").length;
  const totalBalance = resellers.reduce((sum, r) => sum + Number(r.balance || 0), 0);
  const totalAssignedNumbers = resellers.reduce((sum, r) => sum + (r._count?.numbers || 0), 0);

  return (
    <AdminLayout
      title="Reseller Management"
      subtitle="Manage wholesale partners, white-label portals, commission rates, and balances"
    >
      <div style={{ maxWidth: "1380px", margin: "0 auto", padding: "8px 0" }}>
        {/* Alerts */}
        {errorMsg && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}>✕</button>
          </div>
        )}
        {successMsg && (
          <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534" }}>✕</button>
          </div>
        )}

        {/* Metric Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "24px" }}>
          <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 500, textTransform: "uppercase" }}>Total Resellers</div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>{totalResellers}</div>
            <div style={{ fontSize: "12px", color: "#10b981", marginTop: "4px" }}>{activeResellers} active</div>
          </div>

          <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 500, textTransform: "uppercase" }}>Total Reseller Balance</div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#0284c7", marginTop: "4px" }}>৳{totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>In partner wallets</div>
          </div>

          <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 500, textTransform: "uppercase" }}>Assigned Numbers</div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#8b5cf6", marginTop: "4px" }}>{totalAssignedNumbers}</div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>Distributed to resellers</div>
          </div>

          <div style={{ background: "#ffffff", padding: "18px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "12px 18px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                boxShadow: "0 2px 4px rgba(2, 132, 199, 0.2)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create New Reseller</span>
            </button>
          </div>
        </div>

        {/* Search & Action Bar */}
        <div style={{ background: "#ffffff", padding: "16px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ position: "relative", minWidth: "320px", flex: 1 }}>
            <input
              type="text"
              placeholder="Search by company, username, email, or subdomain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px 10px 38px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                outline: "none",
              }}
            />
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              style={{ position: "absolute", left: "12px", top: "11px" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={fetchResellers}
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                background: "#f8fafc",
                fontSize: "13px",
                fontWeight: 500,
                color: "#475569",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              🔄 Refresh
            </button>
            <a
              href="/reseller/login"
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "10px 16px",
                borderRadius: "8px",
                border: "1px solid #bae6fd",
                background: "#f0f9ff",
                fontSize: "13px",
                fontWeight: 600,
                color: "#0284c7",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              ↗ Open Reseller Portal
            </a>
          </div>
        </div>

        {/* Resellers Table */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 18px" }}>Partner &amp; Brand</th>
                  <th style={{ padding: "12px 16px" }}>Username / Email</th>
                  <th style={{ padding: "12px 16px" }}>Wallet Balance</th>
                  <th style={{ padding: "12px 16px" }}>Wholesale Discounts</th>
                  <th style={{ padding: "12px 16px" }}>Customers / Numbers</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                      Loading resellers...
                    </td>
                  </tr>
                ) : resellers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "48px 20px" }}>
                      <div style={{ fontSize: "36px", marginBottom: "8px" }}>🏢</div>
                      <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "16px" }}>No Resellers Found</div>
                      <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
                        Click "Create New Reseller" above to set up your first wholesale partner.
                      </p>
                    </td>
                  </tr>
                ) : (
                  resellers.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{r.companyName}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>
                          Brand: <strong style={{ color: "#0284c7" }}>{r.brandName}</strong>
                        </div>
                        {r.subdomain && (
                          <div style={{ marginTop: "4px" }}>
                            <span style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", color: "#475569", fontFamily: "monospace" }}>
                              {r.subdomain}.softcents.com
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 500, color: "#1e293b" }}>{r.username}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{r.email}</div>
                        {r.phoneNumber && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{r.phoneNumber}</div>}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "#0284c7" }}>
                          ৳{Number(r.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </div>
                        <button
                          onClick={() => {
                            setShowBalanceModal(r);
                            setBalanceAmount("");
                            setBalanceNotes("");
                            setBalanceAction("CREDIT");
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            border: "1px solid #bae6fd",
                            background: "#f0f9ff",
                            color: "#0369a1",
                            cursor: "pointer",
                            marginTop: "4px",
                            fontWeight: 600,
                          }}
                        >
                          ± Adjust Balance
                        </button>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontSize: "12px", color: "#0f172a" }}>
                          Numbers: <strong style={{ color: "#10b981" }}>{r.numberDiscountPercent}% off</strong>
                        </div>
                        <div style={{ fontSize: "12px", color: "#0f172a", marginTop: "2px" }}>
                          Recharge: <strong style={{ color: "#0284c7" }}>{r.rechargeDiscountPercent}% off</strong>
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>
                          👥 {r._count?.customers || 0} Customers
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                          📱 {r._count?.numbers || 0} Numbers
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "999px",
                            background: r.status === "ACTIVE" ? "#ecfdf5" : "#fef2f2",
                            color: r.status === "ACTIVE" ? "#059669" : "#dc2626",
                            border: `1px solid ${r.status === "ACTIVE" ? "#a7f3d0" : "#fecaca"}`,
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "8px" }}>
                          <button
                            onClick={() => openEditModal(r)}
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              borderRadius: "6px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              color: "#334155",
                              cursor: "pointer",
                              fontWeight: 500,
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
        </div>

        {/* Modal: Create Reseller */}
        {showCreateModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "600px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "14px", marginBottom: "18px" }}>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Create New Reseller Partner</h3>
                <button onClick={() => setShowCreateModal(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              <form onSubmit={handleCreateSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Company / Business Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Telecom Express BD"
                      value={newReseller.companyName}
                      onChange={(e) => setNewReseller({ ...newReseller, companyName: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>White-Label Brand Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Telecom Express"
                      value={newReseller.brandName}
                      onChange={(e) => setNewReseller({ ...newReseller, brandName: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Reseller Login Username *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. telexpress"
                      value={newReseller.username}
                      onChange={(e) => setNewReseller({ ...newReseller, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Secure password"
                      value={newReseller.password}
                      onChange={(e) => setNewReseller({ ...newReseller, password: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="partner@example.com"
                      value={newReseller.email}
                      onChange={(e) => setNewReseller({ ...newReseller, email: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Phone / WhatsApp</label>
                    <input
                      type="text"
                      placeholder="017XXXXXXXX"
                      value={newReseller.phoneNumber}
                      onChange={(e) => setNewReseller({ ...newReseller, phoneNumber: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Subdomain Prefix (White-Label)</label>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="e.g. telexpress"
                      value={newReseller.subdomain}
                      onChange={(e) => setNewReseller({ ...newReseller, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "6px 0 0 6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                    <span style={{ background: "#f1f5f9", padding: "8px 12px", border: "1px solid #cbd5e1", borderLeft: "none", borderRadius: "0 6px 6px 0", fontSize: "13px", color: "#64748b" }}>
                      .softcents.com
                    </span>
                  </div>
                </div>

                {/* Wholesale Discounts */}
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginBottom: "8px" }}>Wholesale Commission / Discount Rates</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>Number Discount %</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={newReseller.numberDiscountPercent}
                        onChange={(e) => setNewReseller({ ...newReseller, numberDiscountPercent: e.target.value })}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>Recharge Discount %</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={newReseller.rechargeDiscountPercent}
                        onChange={(e) => setNewReseller({ ...newReseller, rechargeDiscountPercent: e.target.value })}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>Initial Balance (৳)</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={newReseller.initialBalance}
                        onChange={(e) => setNewReseller({ ...newReseller, initialBalance: e.target.value })}
                        style={{ width: "100%", padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#0284c7", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                  >
                    Save &amp; Create Reseller
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Adjust Balance */}
        {showBalanceModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "460px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Adjust Reseller Balance</h3>
                  <p style={{ fontSize: "12px", color: "#64748b" }}>{showBalanceModal.companyName} ({showBalanceModal.username})</p>
                </div>
                <button onClick={() => setShowBalanceModal(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              <div style={{ background: "#f0f9ff", padding: "12px 14px", borderRadius: "8px", border: "1px solid #bae6fd", marginBottom: "16px" }}>
                <span style={{ fontSize: "12px", color: "#0369a1" }}>Current Balance: </span>
                <strong style={{ fontSize: "16px", color: "#0284c7" }}>৳{Number(showBalanceModal.balance || 0).toFixed(2)} BDT</strong>
              </div>

              <form onSubmit={handleBalanceSubmit}>
                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Action Type</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setBalanceAction("CREDIT")}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        border: balanceAction === "CREDIT" ? "2px solid #10b981" : "1px solid #cbd5e1",
                        background: balanceAction === "CREDIT" ? "#ecfdf5" : "#ffffff",
                        color: balanceAction === "CREDIT" ? "#065f46" : "#475569",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      + Credit / Deposit
                    </button>
                    <button
                      type="button"
                      onClick={() => setBalanceAction("DEBIT")}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: "8px",
                        border: balanceAction === "DEBIT" ? "2px solid #ef4444" : "1px solid #cbd5e1",
                        background: balanceAction === "DEBIT" ? "#fef2f2" : "#ffffff",
                        color: balanceAction === "DEBIT" ? "#991b1b" : "#475569",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      - Debit / Deduct
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Amount (৳ BDT) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="Enter amount"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "15px", fontWeight: 600 }}
                  />
                </div>

                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Notes / Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Bank transfer ref #12345"
                    value={balanceNotes}
                    onChange={(e) => setBalanceNotes(e.target.value)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowBalanceModal(null)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={balanceSubmitting}
                    style={{
                      padding: "10px 20px",
                      borderRadius: "8px",
                      border: "none",
                      background: balanceAction === "CREDIT" ? "#10b981" : "#ef4444",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {balanceSubmitting ? "Processing..." : `Confirm ${balanceAction === "CREDIT" ? "Deposit" : "Deduction"}`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Reseller */}
        {showEditModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "550px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Edit Reseller Settings</h3>
                  <p style={{ fontSize: "12px", color: "#64748b" }}>Username: {showEditModal.username}</p>
                </div>
                <button onClick={() => setShowEditModal(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              <form onSubmit={handleEditSubmit}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Company Name</label>
                    <input
                      type="text"
                      value={editForm.companyName}
                      onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Brand Name</label>
                    <input
                      type="text"
                      value={editForm.brandName}
                      onChange={(e) => setEditForm({ ...editForm, brandName: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Phone</label>
                    <input
                      type="text"
                      value={editForm.phoneNumber}
                      onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Subdomain</label>
                    <input
                      type="text"
                      value={editForm.subdomain}
                      onChange={(e) => setEditForm({ ...editForm, subdomain: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Custom Domain</label>
                    <input
                      type="text"
                      placeholder="portal.clientdomain.com"
                      value={editForm.customDomain}
                      onChange={(e) => setEditForm({ ...editForm, customDomain: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Number Disc %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.numberDiscountPercent}
                      onChange={(e) => setEditForm({ ...editForm, numberDiscountPercent: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Recharge Disc %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.rechargeDiscountPercent}
                      onChange={(e) => setEditForm({ ...editForm, rechargeDiscountPercent: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Reset Password (leave empty to keep current)</label>
                  <input
                    type="password"
                    placeholder="New password"
                    value={editForm.password}
                    onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowEditModal(null)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#0284c7", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                  >
                    Save Changes
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
