"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ResellerLayout from "@/components/ResellerLayout";

export const dynamic = "force-dynamic";

function ResellerRechargesContent() {
  const searchParams = useSearchParams();
  const phoneParam = searchParams.get("phone") || "";

  const [phone, setPhone] = useState(phoneParam);
  const [amount, setAmount] = useState("100");
  const [reseller, setReseller] = useState<any>(null);
  const [recharges, setRecharges] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Top up execution state
  const [topUpStage, setTopUpStage] = useState<
    "idle" | "submitting" | "Connecting" | "Finding number" | "Reading balance" | "Recharging" | "Verifying" | "done" | "error"
  >("idle");
  const [stageMessage, setStageMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successResult, setSuccessResult] = useState<any>(null);

  // Fetch reseller info for discount calculation
  useEffect(() => {
    fetch("/api/reseller/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) setReseller(data.reseller);
      })
      .catch(() => {});
  }, []);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/reseller/recharges");
      const data = await res.json();
      if (res.ok && data.success) {
        setRecharges(data.recharges || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Poll worker job if in progress
  const pollJobStatus = async (jobId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/reseller/recharges?jobId=${jobId}`);
        const data = await res.json();

        if (res.ok && data.job) {
          const job = data.job;
          if (job.stage) {
            setStageMessage(`Stage: ${job.stage}`);
          }

          if (job.status === "DONE" || job.status === "SUCCESS") {
            clearInterval(interval);
            setTopUpStage("done");
            setSuccessResult(job);
            fetchHistory();
          } else if (job.status === "ERROR" || job.status === "FAILED") {
            clearInterval(interval);
            setTopUpStage("error");
            setErrorMessage(job.reason || "Recharge operator failed to process top up.");
            fetchHistory();
          }
        }
      } catch {
        // network retry
      }

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setTopUpStage("done");
        setStageMessage("Recharge submitted. Background processor is finalizing operator confirmation.");
        fetchHistory();
      }
    }, 1000);
  };

  const handleRechargeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !amount) return;

    setTopUpStage("submitting");
    setErrorMessage("");
    setSuccessResult(null);
    setStageMessage("Initiating automated top up request...");

    try {
      const res = await fetch("/api/reseller/recharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          amount: Number(amount),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setTopUpStage("error");
        setErrorMessage(data.error || "Failed to submit recharge");
        return;
      }

      if (data.rechargeJobId) {
        setTopUpStage("Recharging");
        setStageMessage("Connecting to telecom carrier gateway...");
        pollJobStatus(data.rechargeJobId);
      } else {
        setTopUpStage("done");
        setSuccessResult(data);
        fetchHistory();
      }
    } catch {
      setTopUpStage("error");
      setErrorMessage("Network error during recharge submission");
    }
  };

  // Calculations
  const numAmount = Number(amount) || 0;
  const discountPercent = Number(reseller?.rechargeDiscountPercent || 0);
  const discountAmount = Number(((numAmount * discountPercent) / 100).toFixed(2));
  const netPay = Math.max(0, numAmount - discountAmount);

  return (
    <ResellerLayout
      title="Instant Number Recharge"
      subtitle="Recharge client numbers with automatic wholesale margin deduction and carrier verification"
    >
      <div style={{ maxWidth: "1280px" }}>
        {/* Top Up Form & Calculation Panel */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "32px" }}>
          {/* Form */}
          <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>⚡ Execute Wholesale Top Up</span>
            </h3>

            {topUpStage === "error" && errorMessage && (
              <div style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", marginBottom: "16px", fontSize: "13px" }}>
                <strong>Recharge Failed:</strong> {errorMessage}
              </div>
            )}

            {topUpStage === "done" && (
              <div style={{ padding: "14px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: "8px", marginBottom: "16px", fontSize: "13px" }}>
                <strong>✓ Top Up Successful!</strong>
                <p style={{ marginTop: "4px" }}>
                  Number {phone} has been recharged with ৳{amount} BDT. Discount saved: ৳{discountAmount.toFixed(2)}.
                </p>
                <button
                  onClick={() => {
                    setTopUpStage("idle");
                    setPhone("");
                  }}
                  style={{ marginTop: "8px", background: "#166534", color: "#ffffff", border: "none", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}
                >
                  Perform Another Top Up
                </button>
              </div>
            )}

            {topUpStage !== "idle" && topUpStage !== "done" && topUpStage !== "error" && (
              <div style={{ padding: "16px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", marginBottom: "16px", textAlign: "center" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0369a1", marginBottom: "4px" }}>
                  Processing Carrier Recharge...
                </div>
                <div style={{ fontSize: "12px", color: "#0284c7" }}>{stageMessage}</div>
                <div style={{ marginTop: "12px", height: "4px", background: "#e0f2fe", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "70%", background: "#0284c7", borderRadius: "2px", animation: "pulse 1.5s infinite" }} />
                </div>
              </div>
            )}

            <form onSubmit={handleRechargeSubmit}>
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Phone / IP Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 09639900643 or 09617XXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "15px",
                    fontFamily: "monospace",
                    fontWeight: 600,
                  }}
                />
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Recharge Amount (৳ BDT) *
                </label>
                <input
                  type="number"
                  required
                  step="1"
                  min="1"
                  max="10000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                />
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  {["50", "100", "200", "500", "1000"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(preset)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: amount === preset ? "#0284c7" : "#f8fafc",
                        color: amount === preset ? "#ffffff" : "#475569",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      ৳{preset}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={topUpStage !== "idle" && topUpStage !== "done" && topUpStage !== "error"}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(2, 132, 199, 0.2)",
                  marginTop: "8px",
                }}
              >
                Confirm &amp; Top Up Now (Pay ৳{netPay.toFixed(2)})
              </button>
            </form>
          </div>

          {/* Wholesale Pricing Breakdown Card */}
          <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginBottom: "16px" }}>
              Wholesale Margin Calculation
            </h3>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ background: "#f8fafc", padding: "18px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "14px" }}>
                  <span style={{ color: "#64748b" }}>Requested Recharge Value:</span>
                  <strong style={{ color: "#0f172a" }}>৳{numAmount.toFixed(2)} BDT</strong>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "14px" }}>
                  <span style={{ color: "#166534" }}>Wholesale Discount Rate:</span>
                  <span style={{ background: "#ecfdf5", color: "#065f46", padding: "2px 8px", borderRadius: "4px", fontWeight: 700, fontSize: "12px" }}>
                    {discountPercent}%
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "14px" }}>
                  <span style={{ color: "#166534" }}>Your Profit / Discount Saved:</span>
                  <strong style={{ color: "#166534" }}>৳{discountAmount.toFixed(2)} BDT</strong>
                </div>

                <div style={{ borderTop: "2px dashed #cbd5e1", paddingTop: "12px", display: "flex", justifyContent: "space-between", fontSize: "16px" }}>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>Net Wallet Deduction:</span>
                  <strong style={{ color: "#0284c7", fontSize: "18px" }}>৳{netPay.toFixed(2)} BDT</strong>
                </div>
              </div>

              <div style={{ marginTop: "18px", background: "#f0fdf4", padding: "12px 14px", borderRadius: "8px", border: "1px solid #bbf7d0", fontSize: "12px", color: "#166534" }}>
                💡 <strong>Reseller Margin Advantage:</strong> You bill your customer the full ৳{numAmount.toFixed(2)} BDT retail price, while your wallet is only charged ৳{netPay.toFixed(2)} BDT, retaining instant profit.
              </div>
            </div>
          </div>
        </div>

        {/* Recharges History Table */}
        <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Recharge Transaction Log</h4>
            <button
              onClick={fetchHistory}
              style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", cursor: "pointer" }}
            >
              🔄 Refresh
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 18px" }}>Number</th>
                  <th style={{ padding: "12px 16px" }}>Subscriber</th>
                  <th style={{ padding: "12px 16px" }}>Amount</th>
                  <th style={{ padding: "12px 16px" }}>Discount Saved</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  <th style={{ padding: "12px 18px", textAlign: "right" }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                      Loading history...
                    </td>
                  </tr>
                ) : recharges.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                      No recharge transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  recharges.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 18px" }}>
                        <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>{r.phone}</span>
                      </td>
                      <td style={{ padding: "12px 16px", color: "#475569" }}>
                        {r.customer?.fullName || "—"}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>
                        ৳{Number(r.amount).toFixed(2)}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#166534", fontWeight: 600 }}>
                        +৳{Number(r.resellerDiscount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: r.status === "DONE" ? "#ecfdf5" : r.status === "PENDING" ? "#fef3c7" : "#fef2f2",
                            color: r.status === "DONE" ? "#065f46" : r.status === "PENDING" ? "#92400e" : "#991b1b",
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 18px", textAlign: "right", color: "#64748b", fontSize: "12px" }}>
                        {new Date(r.createdAt).toLocaleString()}
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

export default function ResellerRechargesPage() {
  return (
    <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>Loading recharge panel...</div>}>
      <ResellerRechargesContent />
    </Suspense>
  );
}
