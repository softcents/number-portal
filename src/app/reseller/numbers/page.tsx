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
  const [purchaseIsFree, setPurchaseIsFree] = useState(false);
  const [purchaseCustomPrice, setPurchaseCustomPrice] = useState("");
  const [isBuying, setIsBuying] = useState(false);

  const [assigningItem, setAssigningItem] = useState<any | null>(null);
  const [selectedCustomerIdForAssign, setSelectedCustomerIdForAssign] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Price Setting Modal
  const [pricingItem, setPricingItem] = useState<any | null>(null);
  const [priceIsFree, setPriceIsFree] = useState(false);
  const [priceCustomAmount, setPriceCustomAmount] = useState("");
  const [isSavingPrice, setIsSavingPrice] = useState(false);

  // Bulk Price Modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMode, setBulkMode] = useState<"FREE" | "CUSTOM">("FREE");
  const [bulkAmount, setBulkAmount] = useState("100");
  const [isSavingBulk, setIsSavingBulk] = useState(false);

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
          isFreeForCustomer: purchaseIsFree,
          resellerSalePrice: purchaseIsFree ? 0 : (purchaseCustomPrice ? Number(purchaseCustomPrice) : undefined),
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
      setPurchaseIsFree(false);
      setPurchaseCustomPrice("");
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

  const handleOpenPriceModal = (item: any) => {
    setPricingItem(item);
    setPriceIsFree(Boolean(item.isCustomerFree));
    setPriceCustomAmount(
      item.isCustomerFree ? "" : (item.effectiveCustomerPrice ? String(item.effectiveCustomerPrice) : "")
    );
  };

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pricingItem) return;
    setIsSavingPrice(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/reseller/numbers/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberId: pricingItem.id,
          isFree: priceIsFree,
          customPrice: priceIsFree ? 0 : (priceCustomAmount ? Number(priceCustomAmount) : null),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to update pricing");
        setIsSavingPrice(false);
        return;
      }

      setSuccessMsg(data.message || "Number pricing updated successfully");
      setPricingItem(null);
      fetchData();
    } catch {
      setErrorMsg("Network error saving pricing");
    } finally {
      setIsSavingPrice(false);
    }
  };

  const handleApplyBulkPricing = async () => {
    const unassignedNumbers = myNumbers.filter((n) => !n.customerId);
    if (unassignedNumbers.length === 0) {
      setErrorMsg("No in-stock numbers available to update");
      setShowBulkModal(false);
      return;
    }

    setIsSavingBulk(true);
    setErrorMsg("");

    try {
      const numberIds = unassignedNumbers.map((n) => n.id);
      const isFree = bulkMode === "FREE";
      const customPrice = isFree ? 0 : Number(bulkAmount || 0);

      const res = await fetch("/api/reseller/numbers/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numberIds,
          isFree,
          customPrice,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to apply bulk pricing");
        setIsSavingBulk(false);
        return;
      }

      setSuccessMsg(data.message || `Pricing updated for ${unassignedNumbers.length} numbers`);
      setShowBulkModal(false);
      fetchData();
    } catch {
      setErrorMsg("Network error applying bulk pricing");
    } finally {
      setIsSavingBulk(false);
    }
  };

  return (
    <ResellerLayout
      title="Number Inventory & Wholesale Pool"
      subtitle="Purchase numbers at wholesale discount, make them FREE (৳0.00) or set any custom charge for your subscribers regardless of Admin rates"
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

        {/* Tab Navigation & Search & Bulk Actions */}
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

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {activeTab === "my" && myNumbers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  color: "#065f46",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span>🏷️</span>
                <span>Bulk Pricing Control</span>
              </button>
            )}

            <div style={{ minWidth: "260px" }}>
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
                    <th style={{ padding: "12px 16px" }}>Admin Base Rate</th>
                    <th style={{ padding: "12px 16px" }}>Your Customer Price</th>
                    <th style={{ padding: "12px 16px" }}>Status</th>
                    <th style={{ padding: "12px 18px", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        Loading numbers...
                      </td>
                    </tr>
                  ) : myNumbers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", padding: "40px" }}>
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
                        <td style={{ padding: "14px 16px", color: "#64748b" }}>
                          <span style={{ fontSize: "13px" }}>
                            ৳{Number(n.adminBaseRate ?? n.salePrice ?? 0).toFixed(2)}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {n.isCustomerFree ? (
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                background: "#ecfdf5",
                                color: "#047857",
                                fontWeight: 800,
                                fontSize: "12px",
                                border: "1px solid #a7f3d0",
                              }}
                            >
                              FREE (৳0.00) ✓
                            </span>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "14px", fontWeight: 800, color: "#0284c7" }}>
                                ৳{Number(n.effectiveCustomerPrice ?? n.salePrice ?? 0).toFixed(2)}
                              </span>
                              {n.isCustomPriceSet && (
                                <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "4px", background: "#f1f5f9", color: "#64748b" }}>
                                  Custom
                                </span>
                              )}
                            </div>
                          )}
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
                              onClick={() => handleOpenPriceModal(n)}
                              style={{
                                padding: "6px 12px",
                                fontSize: "12px",
                                borderRadius: "6px",
                                border: "1px solid #cbd5e1",
                                background: "#f8fafc",
                                color: "#0f172a",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              title="Set Custom Price or Make Free"
                            >
                              <span>🏷️</span>
                              <span>Price / Free</span>
                            </button>
                            <button
                              onClick={() => {
                                setAssigningItem(n);
                                setSelectedCustomerIdForAssign(n.customerId || "");
                              }}
                              style={{
                                padding: "6px 12px",
                                fontSize: "12px",
                                borderRadius: "6px",
                                border: "1px solid #0284c7",
                                background: "#0284c7",
                                color: "#ffffff",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {n.customerId ? "Reassign" : "Assign"}
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
        )}

        {/* TAB 2: WHOLESALE POOL */}
        {activeTab === "pool" && (
          <div style={{ background: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", textTransform: "uppercase" }}>
                    <th style={{ padding: "12px 18px" }}>Number</th>
                    <th style={{ padding: "12px 16px" }}>Carrier</th>
                    <th style={{ padding: "12px 16px" }}>Retail Rate</th>
                    <th style={{ padding: "12px 16px" }}>Your Discount</th>
                    <th style={{ padding: "12px 16px" }}>Wholesale Net Price</th>
                    <th style={{ padding: "12px 18px", textAlign: "right" }}>Action</th>
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
                        <div style={{ fontSize: "32px", marginBottom: "8px" }}>🛒</div>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>No Numbers in Wholesale Pool</div>
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
                            {n.provider?.name || n.displayCompany?.name || "BD Carrier"}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", color: "#64748b", textDecoration: "line-through" }}>
                          ৳{n.retailPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#166534", background: "#f0fdf4", padding: "3px 8px", borderRadius: "4px" }}>
                            {n.discountPercent}% OFF (-৳{n.discountAmount.toFixed(2)})
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{ fontSize: "15px", fontWeight: 800, color: "#0284c7" }}>
                            ৳{n.resellerWholesalePrice.toFixed(2)} BDT
                          </span>
                        </td>
                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          <button
                            onClick={() => {
                              setPurchasingItem(n);
                              setSelectedCustomerIdForPurchase("");
                              setPurchaseIsFree(false);
                              setPurchaseCustomPrice("");
                            }}
                            style={{
                              padding: "7px 16px",
                              fontSize: "13px",
                              borderRadius: "6px",
                              border: "none",
                              background: "#0284c7",
                              color: "#ffffff",
                              fontWeight: 600,
                              cursor: "pointer",
                              boxShadow: "0 1px 3px rgba(2, 132, 199, 0.2)",
                            }}
                          >
                            Buy Wholesale
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

        {/* Modal: Set Custom Price / Make Free */}
        {pricingItem && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "460px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                    🏷️ Customer Pricing Control
                  </h3>
                  <div style={{ fontSize: "13px", color: "#0284c7", fontFamily: "monospace", fontWeight: 700, marginTop: "2px" }}>
                    {pricingItem.number}
                  </div>
                </div>
                <button onClick={() => setPricingItem(null)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              {/* Notice comparing Admin Rate */}
              <div style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "#64748b" }}>Admin Base Rate:</span>
                  <strong style={{ color: "#0f172a" }}>৳{Number(pricingItem.adminBaseRate ?? pricingItem.salePrice ?? 0).toFixed(2)} BDT</strong>
                </div>
                <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "4px" }}>
                  ℹ️ You have complete control. You can give this number for <strong>FREE</strong> or charge your custom price to your subscribers regardless of Admin's rate.
                </div>
              </div>

              <form onSubmit={handleSavePrice}>
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "10px" }}>
                    Select Pricing Mode for this Number:
                  </label>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {/* Option 1: Free */}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: `1.5px solid ${priceIsFree ? "#10b981" : "#e2e8f0"}`,
                        background: priceIsFree ? "#f0fdf4" : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="priceMode"
                        checked={priceIsFree}
                        onChange={() => setPriceIsFree(true)}
                        style={{ width: "18px", height: "18px" }}
                      />
                      <div>
                        <div style={{ fontWeight: 700, color: "#166534", fontSize: "13.5px" }}>
                          🎁 Give to Subscribers for FREE (৳0.00)
                        </div>
                        <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                          Customer can claim it instantly with 0 balance deduction
                        </div>
                      </div>
                    </label>

                    {/* Option 2: Custom Charge */}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: `1.5px solid ${!priceIsFree ? "#0284c7" : "#e2e8f0"}`,
                        background: !priceIsFree ? "#f0f9ff" : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="priceMode"
                        checked={!priceIsFree}
                        onChange={() => setPriceIsFree(false)}
                        style={{ width: "18px", height: "18px", marginTop: "2px" }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: "#0369a1", fontSize: "13.5px" }}>
                          💳 Charge Custom Price (BDT)
                        </div>
                        <div style={{ fontSize: "11.5px", color: "#64748b", marginBottom: "8px" }}>
                          Set the exact amount your customer pays to your gateway
                        </div>

                        {!priceIsFree && (
                          <div>
                            <div style={{ position: "relative" }}>
                              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontWeight: 700, color: "#64748b" }}>৳</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={priceCustomAmount}
                                onChange={(e) => setPriceCustomAmount(e.target.value)}
                                placeholder="e.g. 150"
                                style={{
                                  width: "100%",
                                  padding: "8px 12px 8px 30px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  fontSize: "14px",
                                  fontWeight: 700,
                                  background: "#ffffff",
                                  outline: "none",
                                }}
                              />
                            </div>

                            {/* Quick Select chips */}
                            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                              {["50", "100", "150", "250", "500"].map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setPriceCustomAmount(p)}
                                  style={{
                                    padding: "4px 8px",
                                    borderRadius: "4px",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  ৳{p}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setPricingItem(null)}
                    style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingPrice}
                    style={{ padding: "10px 22px", borderRadius: "8px", border: "none", background: "#0284c7", color: "#ffffff", fontWeight: 600, cursor: isSavingPrice ? "not-allowed" : "pointer" }}
                  >
                    {isSavingPrice ? "Saving..." : "Save Pricing"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Bulk Pricing Control */}
        {showBulkModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div style={{ background: "#ffffff", borderRadius: "16px", maxWidth: "460px", width: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: "12px", marginBottom: "16px" }}>
                <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                  ⚡ Bulk Pricing for In-Stock Numbers
                </h3>
                <button onClick={() => setShowBulkModal(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
              </div>

              <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
                Apply a uniform pricing rule to all your in-stock (unassigned) numbers in 1 click.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1.5px solid ${bulkMode === "FREE" ? "#10b981" : "#e2e8f0"}`,
                    background: bulkMode === "FREE" ? "#f0fdf4" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="bulkMode"
                    checked={bulkMode === "FREE"}
                    onChange={() => setBulkMode("FREE")}
                    style={{ width: "18px", height: "18px" }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, color: "#166534", fontSize: "13px" }}>
                      Make ALL In-Stock Numbers FREE (৳0.00)
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      Your customers can claim any available number for free
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1.5px solid ${bulkMode === "CUSTOM" ? "#0284c7" : "#e2e8f0"}`,
                    background: bulkMode === "CUSTOM" ? "#f0f9ff" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="bulkMode"
                    checked={bulkMode === "CUSTOM"}
                    onChange={() => setBulkMode("CUSTOM")}
                    style={{ width: "18px", height: "18px", marginTop: "2px" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "#0369a1", fontSize: "13px" }}>
                      Set Fixed Custom Price for ALL
                    </div>
                    {bulkMode === "CUSTOM" && (
                      <div style={{ marginTop: "8px" }}>
                        <input
                          type="number"
                          value={bulkAmount}
                          onChange={(e) => setBulkAmount(e.target.value)}
                          placeholder="Price in BDT (e.g. 100)"
                          style={{
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            fontSize: "14px",
                            fontWeight: 700,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  style={{ padding: "10px 16px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569", fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingBulk}
                  onClick={handleApplyBulkPricing}
                  style={{ padding: "10px 22px", borderRadius: "8px", border: "none", background: "#059669", color: "#ffffff", fontWeight: 600, cursor: isSavingBulk ? "not-allowed" : "pointer" }}
                >
                  {isSavingBulk ? "Updating Numbers..." : "Apply to In-Stock Numbers"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Purchase Confirmation (Wholesale Pool) */}
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

              {/* Customer Pricing Choice upon purchase */}
              <div style={{ background: "#f0fdf4", padding: "12px", borderRadius: "8px", border: "1px solid #bbf7d0", marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#166534", marginBottom: "6px" }}>
                  Subscriber Selling Price Setup (Optional):
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#1e293b", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={purchaseIsFree}
                    onChange={(e) => setPurchaseIsFree(e.target.checked)}
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span>Give to my subscriber for <strong>FREE (৳0.00)</strong></span>
                </label>
                {!purchaseIsFree && (
                  <div style={{ marginTop: "8px" }}>
                    <input
                      type="number"
                      placeholder="Custom selling price (BDT)"
                      value={purchaseCustomPrice}
                      onChange={(e) => setPurchaseCustomPrice(e.target.value)}
                      style={{ width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                    />
                  </div>
                )}
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
