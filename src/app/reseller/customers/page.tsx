"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import ResellerLayout from "@/components/ResellerLayout";

export default function ResellerCustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCust, setNewCust] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    companyName: "",
    password: "",
  });

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const url = searchQuery
        ? `/api/reseller/customers?q=${encodeURIComponent(searchQuery)}`
        : "/api/reseller/customers";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setCustomers(data.customers || []);
      } else {
        setErrorMsg(data.error || "Failed to load customers");
      }
    } catch {
      setErrorMsg("Network error loading customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [searchQuery]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/reseller/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCust),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to add customer");
        return;
      }

      setSuccessMsg("Customer registered successfully!");
      setShowAddModal(false);
      setNewCust({ fullName: "", email: "", phoneNumber: "", companyName: "", password: "" });
      fetchCustomers();
    } catch {
      setErrorMsg("Network error creating customer");
    }
  };

  return (
    <ResellerLayout
      title="My Subscribers & Customers"
      subtitle="Register and manage accounts, assigned numbers, and client profiles"
    >
      <div style={{ maxWidth: "1280px" }}>
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

        {/* Action Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ minWidth: "300px", flex: 1, position: "relative" }}>
            <input
              type="text"
              placeholder="Search by name, email, phone, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                outline: "none",
              }}
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "none",
              background: "#0284c7",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            + Register New Customer
          </button>
        </div>

        {/* Table */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 18px" }}>Customer / Subscriber</th>
                  <th style={{ padding: "12px 16px" }}>Contact</th>
                  <th style={{ padding: "12px 16px" }}>Company</th>
                  <th style={{ padding: "12px 16px" }}>Assigned Numbers</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                      Loading customers...
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                      <div style={{ fontSize: "32px", marginBottom: "8px" }}>👥</div>
                      <div style={{ fontWeight: 600, color: "#1e293b" }}>No Subscribers Found</div>
                      <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
                        Click "+ Register New Customer" above to create client accounts.
                      </p>
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{c.fullName}</div>
                        <div style={{ fontSize: "11px", color: "#94a3b8" }}>ID: {c.centralIdentityUserId}</div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontSize: "13px", color: "#1e293b" }}>{c.email}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{c.phoneNumber || "No phone"}</div>
                      </td>
                      <td style={{ padding: "14px 16px", color: "#475569" }}>
                        {c.companyName || "—"}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        {c.numbers && c.numbers.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {c.numbers.map((num: any) => (
                              <span
                                key={num.id}
                                style={{
                                  background: "#f0f9ff",
                                  border: "1px solid #bae6fd",
                                  color: "#0369a1",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  fontFamily: "monospace",
                                }}
                              >
                                {num.number}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: "12px", color: "#94a3b8" }}>No numbers assigned</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: c.isActive ? "#ecfdf5" : "#fef2f2",
                            color: c.isActive ? "#065f46" : "#991b1b",
                          }}
                        >
                          {c.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <Link
                          href={`/reseller/numbers?customerId=${c.id}`}
                          style={{
                            fontSize: "12px",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#0284c7",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          Assign Number
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Add Customer */}
        {showAddModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "480px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Register Subscriber Account</h3>
                <button onClick={() => setShowAddModal(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              <form onSubmit={handleAddSubmit}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Customer Name"
                    value={newCust.fullName}
                    onChange={(e) => setNewCust({ ...newCust, fullName: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="client@example.com"
                    value={newCust.email}
                    onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Phone Number</label>
                    <input
                      type="text"
                      placeholder="017XXXXXXXX"
                      value={newCust.phoneNumber}
                      onChange={(e) => setNewCust({ ...newCust, phoneNumber: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Company Name</label>
                    <input
                      type="text"
                      placeholder="Company (optional)"
                      value={newCust.companyName}
                      onChange={(e) => setNewCust({ ...newCust, companyName: e.target.value })}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Client Portal Password</label>
                  <input
                    type="password"
                    placeholder="Set password for customer portal login"
                    value={newCust.password}
                    onChange={(e) => setNewCust({ ...newCust, password: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#0284c7", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                  >
                    Create Customer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ResellerLayout>
  );
}
