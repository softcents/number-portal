"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import ResellerLayout from "@/components/ResellerLayout";

export default function ResellerNumbersPage() {
  const [activeTab, setActiveTab] = useState<"my" | "pool">("my");
  const [myNumbers, setMyNumbers] = useState<any[]>([]);
  const [poolNumbers, setPoolNumbers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modals
  const [purchasingItem, setPurchasingItem] = useState<any | null>(null);
  const [selectedCustomerIdForPurchase, setSelectedCustomerIdForPurchase] = useState("");
  const [isBuying, setIsBuying] = useState(false);

  const [assigningItem, setAssigningItem] = useState<any | null>(null);
  const [selectedCustomerIdForAssign, setSelectedCustomerIdForAssign] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resMy, resPool, resCust] = await Promise.all([
        fetch(`/api/reseller/numbers?mode=my${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`),
        fetch(`/api/reseller/numbers?mode=pool${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`),
        fetch("/api/reseller/customers"),
      ]);

      const [dataMy, dataPool, dataCust] = await Promise.all([
        resMy.json(),
        resPool.json(),
        resCust.json(),
      ]);

      if (dataMy.success) setMyNumbers(dataMy.numbers || []);
      if (dataPool.success) setPoolNumbers(dataPool.numbers || []);
      if (dataCust.success) setCustomers(dataCust.customers || []);
    } catch {
      setErrorMsg("Network error loading numbers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [searchQuery]);

  const handleBuyNumber = async () => {
    if (!purchasingItem) return;
    setIsBuying(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/reseller/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberId: purchasingItem.id,
          customerId: selectedCustomerIdForPurchase || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to purchase number");
        setIsBuying(false);
        return;
      }

      setSuccessMsg(`Number ${purchasingItem.number} purchased successfully at wholesale rate!`);
      setPurchasingItem(null);
      setSelectedCustomerIdForPurchase("");
      setActiveTab("my");
      fetchData();
    } catch {
      setErrorMsg("Network error during purchase");
    } finally {
      setIsBuying(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningItem) return;
    setIsAssigning(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/reseller/numbers/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberId: assigningItem.id,
          customerId: selectedCustomerIdForAssign || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to assign number");
        setIsAssigning(false);
        return;
      }

      setSuccessMsg(data.message || "Number assignment updated");
      setAssigningItem(null);
      fetchData();
    } catch {
      setErrorMsg("Network error updating assignment");
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <ResellerLayout
      title="Number Inventory & Wholesale Pool"
      subtitle="Purchase virtual numbers at wholesale discount and allocate them to your subscribers"
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

        {/* Tab Navigation & Search */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px", background: "#e2e8f0", padding: "4px", borderRadius: "8px" }}>
            <button
              onClick={() => setActiveTab("my")}
              style={{
                padding: "8px 18px",
                borderRadius: "6px",
                border: "none",
                background: activeTab === "my" ? "#ffffff" : "transparent",
                color: activeTab === "my" ? "#0284c7" : "#64748b",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: activeTab === "my" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
            >
              📱 My Numbers ({myNumbers.length})
            </button>
            <button
              onClick={() => setActiveTab("pool")}
              style={{
                padding: "8px 18px",
                borderRadius: "6px",
                border: "none",
                background: activeTab === "pool" ? "#ffffff" : "transparent",
                color: activeTab === "pool" ? "#0284c7" : "#64748b",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: activeTab === "pool" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
              }}
            >
              🛒 Wholesale Pool ({poolNumbers.length})
            </button>
          </div>

          <div style={{ minWidth: "280px" }}>
            <input
              type="text"
              placeholder="Search numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* TAB 1: MY NUMBERS */}
        {activeTab === "my" && (
          <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 18px" }}>Number</th>
                    <th style={{ padding: "12px 16px" }}>Carrier / Provider</th>
                    <th style={{ padding: "12px 16px" }}>Assigned Subscriber</th>
                    <th style={{ padding: "12px 16px" }}>Wallet Balance</th>
                    <th style={{ padding: "12px 16px" }}>Status</th>
                    <th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        Loading numbers...
                      </td>
                    </tr>
                  ) : myNumbers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                        <div style={{ fontSize: "32px", marginBottom: "8px" }}>📱</div>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>No Numbers Under Reseller</div>
                        <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
                          Switch to "Wholesale Pool" to purchase available numbers at your discount rate.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    myNumbers.map((n) => (
                      <tr key={n.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "14px 18px" }}>
                          <span style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>
                            {n.number}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontSize: "12px", background: "#f1f5f9", padding: "3px 8px", borderRadius: "4px", color: "#475569" }}>
                            {n.provider?.name || n.displayCompany?.name || "BD Carrier"}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {n.customer ? (
                            <div>
                              <div style={{ fontWeight: 600, color: "#1e293b", fontSize: "13px" }}>{n.customer.fullName}</div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>{n.customer.email}</div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>Unassigned (In Stock)</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontSize: "14px", fontWeight: 700, color: "#10b981" }}>
                            ৳{Number(n.wallet?.balance || 0).toFixed(2)}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: n.status === "ACTIVE" || n.status === "ASSIGNED" ? "#ecfdf5" : "#fef3c7",
                              color: n.status === "ACTIVE" || n.status === "ASSIGNED" ? "#065f46" : "#92400e",
                            }}
                          >
                            {n.status}
                          </span>
                        </td>
                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px" }}>
                            <button
                              onClick={() => {
                                setAssigningItem(n);
                                setSelectedCustomerIdForAssign(n.customerId || "");
                              }}
                              style={{
                                padding: "6px 12px",
                                fontSize: "12px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                background: "#ffffff",
                                color: "#0284c7",
                                cursor: "pointer",
                                fontWeight: 600,
                              }}
                            >
                              {n.customerId ? "Reassign" : "Assign to Client"}
                            </button>
                            <Link
                              href={`/reseller/recharges?phone=${n.number}`}
                              style={{
                                padding: "6px 12px",
                                fontSize: "12px",
                                borderRadius: "6px",
                                border: "1px solid #bbf7d0",
                                background: "#f0fdf4",
                                color: "#166534",
                                textDecoration: "none",
                                fontWeight: 600,
                              }}
                            >
                              Top Up
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: WHOLESALE POOL */}
        {activeTab === "pool" && (
          <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 18px" }}>Available Number</th>
                    <th style={{ padding: "12px 16px" }}>Provider</th>
                    <th style={{ padding: "12px 16px" }}>Retail Rate</th>
                    <th style={{ padding: "12px 16px" }}>Reseller Discount</th>
                    <th style={{ padding: "12px 16px" }}>Your Wholesale Price</th>
                    <th style={{ padding: "12px 18px", textAlign: "right" }}>Purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        Loading pool numbers...
                      </td>
                    </tr>
                  ) : poolNumbers.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "40px" }}>
                        <div style={{ fontSize: "32px", marginBottom: "8px" }}>📦</div>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>No Available Numbers in Pool</div>
                        <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>
                          All available inventory has been assigned or purchased. Contact admin for new batch import.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    poolNumbers.map((n) => (
                      <tr key={n.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "14px 18px" }}>
                          <span style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>
                            {n.number}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontSize: "12px", background: "#f1f5f9", padding: "3px 8px", borderRadius: "4px", color: "#475569" }}>
                            {n.provider?.name || "BD Carrier"}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", color: "#94a3b8", textDecoration: "line-through" }}>
                          ৳{n.retailPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", padding: "2px 8px", borderRadius: "999px", fontSize: "12px", fontWeight: 700 }}>
                            {n.discountPercent}% Off (-৳{n.discountAmount.toFixed(2)})
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontSize: "16px", fontWeight: 700, color: "#0284c7" }}>
                            ৳{n.resellerWholesalePrice.toFixed(2)} BDT
                          </span>
                        </td>
                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          <button
                            onClick={() => {
                              setPurchasingItem(n);
                              setSelectedCustomerIdForPurchase("");
                            }}
                            style={{
                              padding: "7px 14px",
                              fontSize: "12px",
                              borderRadius: "6px",
                              border: "none",
                              background: "#0284c7",
                              color: "#ffffff",
                              fontWeight: 600,
                              cursor: "pointer",
                              boxShadow: "0 1px 2px rgba(2, 132, 199, 0.2)",
                            }}
                          >
                            ⚡ Buy Wholesale
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Purchase Confirmation */}
        {purchasingItem && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "460px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Confirm Wholesale Purchase</h3>
                <button onClick={() => setPurchasingItem(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Purchasing Number:</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a", fontFamily: "monospace", marginTop: "2px" }}>
                  {purchasingItem.number}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #e2e8f0", paddingTop: "10px", marginTop: "10px", fontSize: "13px" }}>
                  <span style={{ color: "#64748b" }}>Retail Price:</span>
                  <span style={{ textDecoration: "line-through", color: "#94a3b8" }}>৳{purchasingItem.retailPrice.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "13px" }}>
                  <span style={{ color: "#166534" }}>Wholesale Discount ({purchasingItem.discountPercent}%):</span>
                  <span style={{ color: "#166534", fontWeight: 600 }}>-৳{purchasingItem.discountAmount.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #cbd5e1", paddingTop: "8px", marginTop: "8px", fontSize: "15px", fontWeight: 700 }}>
                  <span style={{ color: "#0f172a" }}>Net Wallet Deduction:</span>
                  <span style={{ color: "#0284c7" }}>৳{purchasingItem.resellerWholesalePrice.toFixed(2)} BDT</span>
                </div>
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                  Assign Directly to Subscriber (Optional)
                </label>
                <select
                  value={selectedCustomerIdForPurchase}
                  onChange={(e) => setSelectedCustomerIdForPurchase(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                >
                  <option value="">-- Keep in Stock (Unassigned) --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.email})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setPurchasingItem(null)}
                  style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBuying}
                  onClick={handleBuyNumber}
                  style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#0284c7", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                >
                  {isBuying ? "Deducting & Purchasing..." : `Pay ৳${purchasingItem.resellerWholesalePrice.toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Assign / Reassign Number */}
        {assigningItem && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "440px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Assign Subscriber</h3>
                  <div style={{ fontSize: "13px", color: "#0284c7", fontFamily: "monospace", fontWeight: 600, marginTop: "2px" }}>
                    {assigningItem.number}
                  </div>
                </div>
                <button onClick={() => setAssigningItem(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              <form onSubmit={handleAssignSubmit}>
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                    Select Subscriber / Customer
                  </label>
                  <select
                    value={selectedCustomerIdForAssign}
                    onChange={(e) => setSelectedCustomerIdForAssign(e.target.value)}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  >
                    <option value="">-- Unassign (Return to Reseller Stock) --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setAssigningItem(null)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAssigning}
                    style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#0284c7", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                  >
                    {isAssigning ? "Updating..." : "Save Assignment"}
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
