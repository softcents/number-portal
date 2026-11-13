"use client";

import React, { useState, useEffect } from "react";
import ResellerLayout from "@/components/ResellerLayout";

export default function ResellerWalletPage() {
  const [balance, setBalance] = useState<number>(0);
  const [currency, setCurrency] = useState("BDT");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Deposit modal
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("500");
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositNotice, setDepositNotice] = useState("");

  const fetchWallet = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reseller/wallet");
      const data = await res.json();
      if (res.ok && data.success) {
        setBalance(data.balance || 0);
        setCurrency(data.currency || "BDT");
        setTransactions(data.transactions || []);
      } else {
        setErrorMsg(data.error || "Failed to load wallet");
      }
    } catch {
      setErrorMsg("Network error loading wallet");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDepositing(true);
    setErrorMsg("");
    setDepositNotice("");

    try {
      const res = await fetch("/api/reseller/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(depositAmount) }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Deposit failed");
        setIsDepositing(false);
        return;
      }

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      setDepositNotice(data.message || "Please contact administration for manual balance credit.");
    } catch {
      setErrorMsg("Network error initiating deposit");
    } finally {
      setIsDepositing(false);
    }
  };

  return (
    <ResellerLayout
      title="Wallet & Financial Ledger"
      subtitle="View your credit balances, purchase deductions, margin earnings, and statement history"
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

        {/* Balance Header Card */}
        <div
          style={{
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            color: "#ffffff",
            padding: "24px 28px",
            borderRadius: "14px",
            marginBottom: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
            boxShadow: "0 4px 6px -1px rgba(2, 132, 199, 0.25)",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", opacity: 0.9, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Available Partner Balance
            </div>
            <div style={{ fontSize: "36px", fontWeight: 800, marginTop: "4px" }}>
              ৳{balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} {currency}
            </div>
            <div style={{ fontSize: "12px", opacity: 0.85, marginTop: "4px" }}>
              Funds are automatically drawn when issuing wholesale numbers or executing top ups.
            </div>
          </div>

          <div>
            <button
              onClick={() => {
                setShowDepositModal(true);
                setDepositNotice("");
              }}
              style={{
                background: "#ffffff",
                color: "#0369a1",
                border: "none",
                borderRadius: "8px",
                padding: "12px 22px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              }}
            >
              + Deposit Funds
            </button>
          </div>
        </div>

        {/* Transactions Table */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Wallet Transaction Ledger</h4>
            <button
              onClick={fetchWallet}
              style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
            >
              🔄 Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 18px" }}>Type / Details</th>
                  <th style={{ padding: "12px 16px" }}>Gross Amount</th>
                  <th style={{ padding: "12px 16px" }}>Wholesale Discount</th>
                  <th style={{ padding: "12px 16px" }}>Net Wallet Impact</th>
                  <th style={{ padding: "12px 16px" }}>Balance (Before → After)</th>
                  <th style={{ padding: "12px 18px", textAlign: "right" }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                      Loading ledger...
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                      No wallet transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => {
                    const isCredit = tx.type === "DEPOSIT" || tx.type === "COMMISSION";
                    return (
                      <tr key={tx.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "14px 18px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "4px",
                              background: isCredit ? "#ecfdf5" : "#f1f5f9",
                              color: isCredit ? "#065f46" : "#334155",
                              marginRight: "8px",
                            }}
                          >
                            {tx.type}
                          </span>
                          <span style={{ fontSize: "13px", color: "#1e293b" }}>{tx.notes || tx.reference}</span>
                        </td>
                        <td style={{ padding: "14px 16px", color: "#475569" }}>
                          ৳{Number(tx.amount).toFixed(2)}
                        </td>
                        <td style={{ padding: "14px 16px", color: "#166534", fontWeight: 600 }}>
                          {Number(tx.discountAmount) > 0 ? `৳${Number(tx.discountAmount).toFixed(2)}` : "—"}
                        </td>
                        <td style={{ padding: "14px 16px", fontWeight: 700, color: isCredit ? "#10b981" : "#ef4444" }}>
                          {isCredit ? "+" : "-"}৳{Number(tx.netAmount).toFixed(2)}
                        </td>
                        <td style={{ padding: "14px 16px", fontSize: "13px", color: "#64748b" }}>
                          ৳{Number(tx.balanceBefore).toFixed(2)} → <strong>৳{Number(tx.balanceAfter).toFixed(2)}</strong>
                        </td>
                        <td style={{ padding: "14px 18px", textAlign: "right", color: "#64748b", fontSize: "12px" }}>
                          {new Date(tx.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Deposit */}
        {showDepositModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "440px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Deposit Reseller Balance</h3>
                <button onClick={() => setShowDepositModal(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              {depositNotice && (
                <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", color: "#0369a1", padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }}>
                  {depositNotice}
                </div>
              )}

              <form onSubmit={handleDepositSubmit}>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                    Amount to Deposit (৳ BDT)
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "16px", fontWeight: 700 }}
                  />
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    {["500", "1000", "2000", "5000", "10000"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setDepositAmount(p)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          background: depositAmount === p ? "#0284c7" : "#f8fafc",
                          color: depositAmount === p ? "#ffffff" : "#475569",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ৳{p}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setShowDepositModal(false)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isDepositing}
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#0284c7", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                  >
                    {isDepositing ? "Proceeding..." : "Pay / Request Invoice"}
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
