"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import ResellerLayout from "@/components/ResellerLayout";

export default function ResellerDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [recentRecharges, setRecentRecharges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/reseller/stats");
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats);
        setRecentTransactions(data.recentTransactions || []);
        setRecentRecharges(data.recentRecharges || []);
      }
    } catch (err) {
      console.error("Failed to load reseller stats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <ResellerLayout
      title="Partner Overview"
      subtitle="Monitor your wholesale inventory, subscriber accounts, transactions, and commission margins"
    >
      <div style={{ maxWidth: "1280px" }}>
        {/* Metric Cards Row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {/* Wallet Balance */}
          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Reseller Wallet Balance
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#0284c7", marginTop: "6px" }}>
              ৳{Number(stats?.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ marginTop: "10px" }}>
              <Link
                href="/reseller/wallet"
                style={{
                  display: "inline-block",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#0369a1",
                  background: "#f0f9ff",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  textDecoration: "none",
                  border: "1px solid #bae6fd",
                }}
              >
                + Deposit / View Ledger →
              </Link>
            </div>
          </div>

          {/* Wholesale Margins */}
          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Your Wholesale Rates
            </div>
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "#475569" }}>Number Purchase Discount:</span>
                <strong style={{ color: "#10b981", fontSize: "15px" }}>{stats?.numberDiscountPercent || 0}% Off</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span style={{ color: "#475569" }}>Top Up / Recharge Margin:</span>
                <strong style={{ color: "#0284c7", fontSize: "15px" }}>{stats?.rechargeDiscountPercent || 0}% Off</strong>
              </div>
            </div>
          </div>

          {/* My Customers */}
          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Subscribers / Customers
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#0f172a", marginTop: "6px" }}>
              {stats?.totalCustomers || 0}
            </div>
            <div style={{ marginTop: "10px" }}>
              <Link
                href="/reseller/customers"
                style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", textDecoration: "none" }}
              >
                Manage Customers →
              </Link>
            </div>
          </div>

          {/* Active Numbers */}
          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>
              Numbers Under Reseller
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700, color: "#8b5cf6", marginTop: "6px" }}>
              {stats?.totalNumbers || 0}
            </div>
            <div style={{ marginTop: "10px" }}>
              <Link
                href="/reseller/numbers"
                style={{ fontSize: "12px", fontWeight: 600, color: "#8b5cf6", textDecoration: "none" }}
              >
                Browse Inventory &amp; Pool →
              </Link>
            </div>
          </div>
        </div>

        {/* Quick Action Banner */}
        <div
          style={{
            background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
            color: "#ffffff",
            padding: "20px 24px",
            borderRadius: "12px",
            marginBottom: "28px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Reseller Quick Actions</h3>
            <p style={{ fontSize: "13px", opacity: 0.9, marginTop: "2px" }}>
              Issue wholesale numbers, top up clients, and register new sub-customers with automated discount deduction.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link
              href="/reseller/numbers"
              style={{
                background: "#ffffff",
                color: "#0369a1",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              📱 Buy Numbers from Pool
            </Link>
            <Link
              href="/reseller/recharges"
              style={{
                background: "#f0fdf4",
                color: "#166534",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              ⚡ Instant Top Up
            </Link>
            <Link
              href="/reseller/customers"
              style={{
                background: "rgba(255,255,255,0.2)",
                color: "#ffffff",
                padding: "8px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                textDecoration: "none",
                border: "1px solid rgba(255,255,255,0.4)",
              }}
            >
              👥 Add Customer
            </Link>
          </div>
        </div>

        {/* Two Columns: Recent Wallet Transactions & Recent Recharges */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Left: Recent Wallet Ledger */}
          <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Recent Wallet Transactions</h4>
              <Link href="/reseller/wallet" style={{ fontSize: "12px", color: "#0284c7", fontWeight: 600, textDecoration: "none" }}>
                Full Ledger →
              </Link>
            </div>

            {recentTransactions.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                No wallet transactions recorded yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {recentTransactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    style={{
                      padding: "10px 12px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #f1f5f9",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>
                        {tx.type === "DEPOSIT" ? "Balance Deposit" : tx.type === "NUMBER_PURCHASE" ? "Number Purchase" : "Recharge Top Up"}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                        {tx.reference || tx.notes}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: tx.type === "DEPOSIT" ? "#10b981" : "#ef4444",
                        }}
                      >
                        {tx.type === "DEPOSIT" ? "+" : "-"}৳{Number(tx.netAmount).toFixed(2)}
                      </div>
                      {Number(tx.discountAmount) > 0 && (
                        <div style={{ fontSize: "10px", color: "#10b981" }}>Saved ৳{Number(tx.discountAmount).toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Recent Customer Recharges */}
          <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <h4 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>Recent Recharges</h4>
              <Link href="/reseller/recharges" style={{ fontSize: "12px", color: "#0284c7", fontWeight: 600, textDecoration: "none" }}>
                View All →
              </Link>
            </div>

            {recentRecharges.length === 0 ? (
              <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                No recharges performed yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {recentRecharges.slice(0, 5).map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: "10px 12px",
                      background: "#f8fafc",
                      borderRadius: "8px",
                      border: "1px solid #f1f5f9",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>
                        {r.phone}
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>
                        {r.customer?.fullName || "Direct Recharge"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                        ৳{Number(r.amount).toFixed(2)}
                      </div>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: r.status === "DONE" ? "#ecfdf5" : r.status === "PENDING" ? "#fef3c7" : "#fef2f2",
                          color: r.status === "DONE" ? "#065f46" : r.status === "PENDING" ? "#92400e" : "#991b1b",
                        }}
                      >
                        {r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </ResellerLayout>
  );
}
