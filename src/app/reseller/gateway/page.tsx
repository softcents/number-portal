"use client";

import React, { useState, useEffect } from "react";
import ResellerLayout from "@/components/ResellerLayout";

export const dynamic = "force-dynamic";

export default function ResellerGatewayPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({
    pgIsActive: false,
    pgApiKey: "",
    pgApiKeyMasked: "",
    pgBaseUrl: "https://epay.softcents.com/api",
    manualBkashNumber: "",
    manualNagadNumber: "",
    manualRocketNumber: "",
    manualPaymentInstructions: "",
  });

  const [stats, setStats] = useState({
    totalDepositsAmount: 0,
    totalDepositsCount: 0,
  });

  const [transactions, setTransactions] = useState<any[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadGatewayData();
    loadTransactions();
  }, []);

  const loadGatewayData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reseller/gateway");
      const data = await res.json();
      if (data.success) {
        setForm({
          pgIsActive: data.gateway.pgIsActive,
          pgApiKey: data.gateway.pgApiKeyMasked || "",
          pgApiKeyMasked: data.gateway.pgApiKeyMasked || "",
          pgBaseUrl: data.gateway.pgBaseUrl || "https://epay.softcents.com/api",
          manualBkashNumber: data.gateway.manualBkashNumber || "",
          manualNagadNumber: data.gateway.manualNagadNumber || "",
          manualRocketNumber: data.gateway.manualRocketNumber || "",
          manualPaymentInstructions: data.gateway.manualPaymentInstructions || "",
        });
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err: any) {
      console.error("Failed to load gateway:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const res = await fetch("/api/reseller/gateway/transactions");
      const data = await res.json();
      if (data.success && data.transactions) {
        setTransactions(data.transactions);
      }
    } catch (err: any) {
      console.error("Failed to load transactions:", err);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/reseller/gateway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: form.pgApiKey,
          baseUrl: form.pgBaseUrl,
        }),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || (data.success ? "Connection verified!" : "Connection failed"),
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Failed to connect to gateway",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reseller/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pgIsActive: form.pgIsActive,
          pgApiKey: form.pgApiKey,
          pgBaseUrl: form.pgBaseUrl,
          manualBkashNumber: form.manualBkashNumber,
          manualNagadNumber: form.manualNagadNumber,
          manualRocketNumber: form.manualRocketNumber,
          manualPaymentInstructions: form.manualPaymentInstructions,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save gateway configuration");
      }
      setMsg({ type: "success", text: "Personal Payment Gateway settings saved successfully!" });
      loadGatewayData();
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResellerLayout
      title="Personal Payment Gateway & Auto Balance"
      subtitle="Connect your PipraPay gateway so your customers' payments go straight to your account, and their wallet balance updates automatically."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Alerts */}
        {msg && (
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "10px",
              fontSize: "14px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: msg.type === "success" ? "#ecfdf5" : "#fef2f2",
              color: msg.type === "success" ? "#065f46" : "#991b1b",
              border: `1px solid ${msg.type === "success" ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            <span>{msg.text}</span>
            <button
              onClick={() => setMsg(null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "inherit" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 500, marginBottom: "8px" }}>
              Total Customer Auto Deposits
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "#059669" }}>
              ৳ {stats.totalDepositsAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
              {stats.totalDepositsCount} successful deposit transactions
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 500, marginBottom: "8px" }}>
              Personal Gateway Status
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span
                style={{
                  display: "inline-block",
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: form.pgIsActive ? "#10b981" : "#94a3b8",
                }}
              />
              <span style={{ fontSize: "22px", fontWeight: 700, color: form.pgIsActive ? "#065f46" : "#475569" }}>
                {form.pgIsActive ? "ACTIVE & LIVE" : "DISABLED"}
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
              {form.pgIsActive
                ? "Customers deposit directly to your merchant account"
                : "Using system default or manual payment flow"}
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 500, marginBottom: "8px" }}>
              Instant Auto Balance
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "#0284c7" }}>
              Zero Manual Approval
            </div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
              bKash, Nagad, Rocket, Cards confirmed automatically in real-time
            </div>
          </div>
        </div>

        {/* Configuration Form Card */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#fafafa",
            }}
          >
            <div>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                💳 Personal PipraPay (ePay) Configuration
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "4px 0 0" }}>
                Configure your personal API key from <a href="https://epay.softcents.com" target="_blank" rel="noreferrer" style={{ color: "#0284c7", textDecoration: "underline" }}>epay.softcents.com</a>.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ fontSize: "14px", fontWeight: 600, color: "#334155", cursor: "pointer" }}>
                Activate Personal Gateway
              </label>
              <input
                type="checkbox"
                checked={form.pgIsActive}
                onChange={(e) => setForm({ ...form, pgIsActive: e.target.checked })}
                style={{ width: "20px", height: "20px", cursor: "pointer" }}
              />
            </div>
          </div>

          <form onSubmit={handleSave} style={{ padding: "24px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
              {/* API Key */}
              <div style={{ gridColumn: "span 2" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  PipraPay Merchant API Key *
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={form.pgApiKey}
                      onChange={(e) => setForm({ ...form, pgApiKey: e.target.value })}
                      placeholder="Enter your personal PipraPay API Key"
                      style={{
                        width: "100%",
                        padding: "10px 42px 10px 14px",
                        fontSize: "14px",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        outline: "none",
                        fontFamily: "monospace",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#64748b",
                        fontSize: "14px",
                      }}
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    style={{
                      padding: "10px 18px",
                      background: "#f1f5f9",
                      color: "#334155",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: testing ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {testing ? "Testing..." : "⚡ Test Connection"}
                  </button>
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                  Obtain this API key from your merchant dashboard on <a href="https://epay.softcents.com" target="_blank" rel="noreferrer" style={{ color: "#0284c7" }}>epay.softcents.com</a>.
                </div>

                {/* Test Result Message */}
                {testResult && (
                  <div
                    style={{
                      marginTop: "10px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 500,
                      background: testResult.success ? "#ecfdf5" : "#fef2f2",
                      color: testResult.success ? "#065f46" : "#991b1b",
                      border: `1px solid ${testResult.success ? "#a7f3d0" : "#fecaca"}`,
                    }}
                  >
                    {testResult.success ? "✅ " : "❌ "} {testResult.message}
                  </div>
                )}
              </div>

              {/* Base URL */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  PipraPay API Base URL
                </label>
                <input
                  type="text"
                  value={form.pgBaseUrl}
                  onChange={(e) => setForm({ ...form, pgBaseUrl: e.target.value })}
                  placeholder="https://epay.softcents.com/api"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: "14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                  }}
                />
              </div>

              {/* Webhook Endpoint */}
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Webhook URL (Auto Configured)
                </label>
                <input
                  type="text"
                  readOnly
                  value="https://number-portal.softcents.com/api/payments/webhook"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: "14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#64748b",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Manual Payment Section */}
            <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #f1f5f9" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
                📱 Fallback / Manual Mobile Banking Options (Optional)
              </h3>
              <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
                Provide your direct phone numbers if you wish to allow customers to send manual bKash or Nagad payments when needed.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    bKash Number
                  </label>
                  <input
                    type="text"
                    value={form.manualBkashNumber}
                    onChange={(e) => setForm({ ...form, manualBkashNumber: e.target.value })}
                    placeholder="e.g. 017XXXXXXXX (Personal/Merchant)"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Nagad Number
                  </label>
                  <input
                    type="text"
                    value={form.manualNagadNumber}
                    onChange={(e) => setForm({ ...form, manualNagadNumber: e.target.value })}
                    placeholder="e.g. 018XXXXXXXX"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                    Rocket Number
                  </label>
                  <input
                    type="text"
                    value={form.manualRocketNumber}
                    onChange={(e) => setForm({ ...form, manualRocketNumber: e.target.value })}
                    placeholder="e.g. 019XXXXXXXX"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Payment Instructions for Customers
                </label>
                <textarea
                  value={form.manualPaymentInstructions}
                  onChange={(e) => setForm({ ...form, manualPaymentInstructions: e.target.value })}
                  placeholder="Instructions displayed to your customers if they choose manual deposit..."
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    fontSize: "13px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Submit button */}
            <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "11px 28px",
                  background: "#0284c7",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: saving ? "not-allowed" : "pointer",
                  boxShadow: "0 2px 4px rgba(2, 132, 199, 0.25)",
                }}
              >
                {saving ? "Saving Changes..." : "Save Gateway Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* Customer Auto-Deposit Transactions History Table */}
        <div
          style={{
            background: "#ffffff",
            borderRadius: "12px",
            border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "18px 24px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                📜 Customer Auto Balance Add History
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "2px 0 0" }}>
                Real-time deposits made by your customers through your personal payment gateway.
              </p>
            </div>
            <button
              onClick={loadTransactions}
              style={{
                padding: "6px 14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#475569",
                cursor: "pointer",
              }}
            >
              🔄 Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontWeight: 600 }}>
                  <th style={{ padding: "12px 20px" }}>Customer</th>
                  <th style={{ padding: "12px 20px" }}>Type</th>
                  <th style={{ padding: "12px 20px" }}>Amount</th>
                  <th style={{ padding: "12px 20px" }}>Balance Impact</th>
                  <th style={{ padding: "12px 20px" }}>Reference</th>
                  <th style={{ padding: "12px 20px" }}>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                      No customer deposit transactions recorded yet. Once your customers add balance, transactions will appear here instantly.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 20px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>
                          {tx.customer?.fullName || "Customer"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          {tx.customer?.email} {tx.customer?.phoneNumber ? `• ${tx.customer.phoneNumber}` : ""}
                        </div>
                      </td>
                      <td style={{ padding: "12px 20px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: tx.type === "DEPOSIT" ? "#ecfdf5" : "#fef2f2",
                            color: tx.type === "DEPOSIT" ? "#065f46" : "#991b1b",
                          }}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td style={{ padding: "12px 20px", fontWeight: 700, color: tx.type === "DEPOSIT" ? "#059669" : "#dc2626" }}>
                        {tx.type === "DEPOSIT" ? "+" : "-"}৳ {Number(tx.amount).toFixed(2)}
                      </td>
                      <td style={{ padding: "12px 20px", color: "#475569" }}>
                        ৳ {Number(tx.balanceBefore).toFixed(2)} → <strong>৳ {Number(tx.balanceAfter).toFixed(2)}</strong>
                      </td>
                      <td style={{ padding: "12px 20px", color: "#64748b", fontFamily: "monospace", fontSize: "12px" }}>
                        {tx.referenceId || "—"}
                      </td>
                      <td style={{ padding: "12px 20px", color: "#64748b", fontSize: "12px" }}>
                        {new Date(tx.createdAt).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ResellerLayout>
  );
}
