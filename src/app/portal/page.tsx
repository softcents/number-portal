"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppLauncher from "@/components/AppLauncher";
import { useAuthStore } from "@/store/useAuthStore";
import { useNumberStore } from "@/store/useNumberStore";

interface NumberItem {
  id: string;
  number: string;
  normalizedNumber: string;
  salePrice: number;
  numberType: string;
  city?: string;
  status: string;
  displayCompany?: {
    id: string;
    code: string;
    name: string;
  };
}

interface MyNumberItem {
  id: string;
  number: string;
  status: string;
  displayCompany?: { code: string; name: string };
  provider?: { code: string };
  wallet?: {
    id: string;
    balance: number;
    currency: string;
    status: string;
  };
  createdAt: string;
}

interface OrderItem {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  items: Array<{ number: { number: string } }>;
}

export default function CustomerPortalPage() {
  const router = useRouter();

  // User state
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState<"catalog" | "my-numbers" | "orders" | "payments">("catalog");

  // Catalog state
  const [numbers, setNumbers] = useState<NumberItem[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPrefix, setSelectedPrefix] = useState<string>("ALL");

  // User data
  const [myNumbers, setMyNumbers] = useState<MyNumberItem[]>([]);
  const [myOrders, setMyOrders] = useState<OrderItem[]>([]);
  const [myPayments, setMyPayments] = useState<any[]>([]);
  const [myRecharges, setMyRecharges] = useState<any[]>([]);
  const [paymentViewFilter, setPaymentViewFilter] = useState<"side-by-side" | "purchases" | "recharges">("side-by-side");
  // ICC live balances: number string -> balance value
  const [iccBalances, setIccBalances] = useState<Record<string, number | null>>({});
  const [balanceUpdatedTimes, setBalanceUpdatedTimes] = useState<Record<string, string>>({});
  const [loadingMyData, setLoadingMyData] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Purchase modal
  const [purchasingNumber, setPurchasingNumber] = useState<NumberItem | null>(null);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  // Recharge modal (old PipraPay state — kept in place but unused)
  const [rechargeWallet, setRechargeWallet] = useState<{ walletId: string; number: string } | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState<string>("100");
  const [isProcessingRecharge, setIsProcessingRecharge] = useState(false);

  // ─── Automated ICC Talk Top Up Modal State ─────────────────────────────
  const [topUpModal, setTopUpModal] = useState<{
    numberId: string;
    phone: string;
    currentBalance: number;
    idempotencyKey: string;
  } | null>(null);
  const [topUpAmount, setTopUpAmount] = useState<string>("100");
  const [topUpStage, setTopUpStage] = useState<
    "input" | "Connecting" | "Finding number" | "Reading balance" | "Recharging" | "Verifying" | "done" | "error" | "uncertain"
  >("input");
  const [topUpResult, setTopUpResult] = useState<{
    balanceBefore?: number;
    balanceAfter?: number;
    amount?: number;
    durationMs?: number;
    reference?: string;
    reason?: string;
  } | null>(null);
  const [recentRecharges, setRecentRecharges] = useState<any[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [topUpError, setTopUpError] = useState<string>("");

  const handleOpenTopUpModal = async (num: MyNumberItem) => {
    const liveBal = iccBalances[num.number];
    const curBal = typeof liveBal === "number" ? liveBal : Number(num.wallet?.balance || 0);
    const freshKey = "topup_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);

    setTopUpModal({
      numberId: num.id,
      phone: num.number,
      currentBalance: curBal,
      idempotencyKey: freshKey,
    });
    setTopUpAmount("100");
    setTopUpStage("input");
    setTopUpResult(null);
    setTopUpError("");

    setLoadingRecent(true);
    try {
      const res = await fetch(`/api/recharge?phone=${encodeURIComponent(num.number)}`);
      if (res.ok) {
        const d = await res.json();
        setRecentRecharges(d.recentRecharges || []);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoadingRecent(false);
    }
  };

  const mapFriendlyReason = (reason?: string) => {
    switch (reason) {
      case "login_failed":
        return "Billing system login failed. Please try again shortly.";
      case "phone_not_found":
        return "This phone number could not be found in the billing system.";
      case "inactive_client":
        return "This number is currently marked inactive in the carrier system.";
      case "ambiguous_phone":
        return "Multiple records matched this phone number. Please contact support.";
      case "invalid_amount":
        return "The requested amount is invalid.";
      case "insufficient_reseller_balance":
        return "System reseller balance is currently insufficient. Please contact support.";
      case "icc_rejected":
      case "ranksitt_rejected":
      case "icon_rejected":
        return "The billing network rejected the recharge request.";
      case "balance_mismatch":
        return "The new balance does not match the expected recharge amount.";
      case "unconfirmed":
        return "The recharge outcome could not be confirmed in time. Support has been notified.";
      case "busy":
        return "Another recharge is currently being processed. Please wait a moment and try again.";
      case "site_unavailable":
        return "The billing service is temporarily unreachable.";
      case "duplicate_request":
        return "A recharge for the same amount was recently submitted. Please wait 30 seconds.";
      default:
        return reason || "An unexpected error occurred during recharge.";
    }
  };

  const handleConfirmTopUp = async () => {
    if (!topUpModal) return;
    const numAmt = Number(topUpAmount);
    if (isNaN(numAmt) || numAmt < 1 || numAmt > 5000) {
      setTopUpError("Please enter a valid amount between ৳1 and ৳5,000 BDT.");
      return;
    }
    if (Math.round(numAmt * 100) !== numAmt * 100) {
      setTopUpError("Amount can have at most 2 decimal places.");
      return;
    }
    setTopUpError("");
    setTopUpStage("Connecting");

    try {
      // Step 1: Create PipraPay payment session for this recharge
      // The customer must pay FIRST. After PipraPay confirms payment,
      // the ICC Talk recharge is triggered automatically.
      const res = await fetch("/api/payments/recharge-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: topUpModal.phone,
          numberId: topUpModal.numberId,
          amount: numAmt,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setTopUpStage("error");
        setTopUpResult({
          reason: data.error || "Failed to create payment session.",
          amount: numAmt,
        });
        return;
      }

      if (!data.paymentUrl) {
        setTopUpStage("error");
        setTopUpResult({
          reason: "No payment URL received from gateway.",
          amount: numAmt,
        });
        return;
      }

      // Step 2: Redirect customer to PipraPay to complete payment
      // After payment, PipraPay redirects back to /portal?payment=recharge_success&paymentId=...
      window.location.href = data.paymentUrl;

    } catch (err: any) {
      setTopUpStage("error");
      setTopUpResult({
        reason: err?.message || "Network error while creating payment session.",
        amount: numAmt,
      });
    }
  };

  // Notification Banner
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  // Recharge payment return state (for when PipraPay redirects back)
  const [rechargeReturnPaymentId, setRechargeReturnPaymentId] = useState<string | null>(null);

  // Check URL parameters for payment notifications (including recharge return)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const paymentStatus = params.get("payment");
      const paymentId = params.get("paymentId");
      const phone = params.get("phone");

      if (paymentStatus === "success") {
        setBannerMessage("⏳ Verifying your payment with PipraPay...");
        if (paymentId) {
          fetch(`/api/payments/verify/${encodeURIComponent(paymentId)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.success && data.payment?.status === "COMPLETED") {
                setBannerMessage("🎉 Payment verified via PipraPay! Your number has been activated.");
                fetchUser();
                setActiveTab("my-numbers");
              } else {
                setBannerMessage("ℹ️ Payment session recorded. Finalizing order activation...");
                fetchUser();
              }
            })
            .catch(() => {
              setBannerMessage("🎉 Payment received via PipraPay! Your number has been activated.");
              fetchUser();
            });
        } else {
          setBannerMessage("🎉 Payment verified via PipraPay! Your number has been activated.");
          fetchUser();
        }

        // Clean URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      } else if (paymentStatus === "failed" || paymentStatus === "cancelled") {
        setBannerMessage("⚠️ Payment was not completed or was cancelled.");
        // Clean URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      } else if (paymentStatus === "recharge_success" && paymentId) {
        // User returned from PipraPay after recharge payment
        // Verify the payment and trigger ICC recharge
        setRechargeReturnPaymentId(paymentId);
        setBannerMessage("⏳ Payment received! Verifying and dispatching your recharge...");
        setActiveTab("my-numbers");

        // Call recharge-return to verify and dispatch ICC recharge
        const pp_id = params.get("pp_id") || params.get("invoice_id") || "";
        fetch(`/api/payments/recharge-return?paymentId=${encodeURIComponent(paymentId)}&pp_id=${encodeURIComponent(pp_id)}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.success) {
              setBannerMessage("✅ Payment confirmed! Recharge is being processed. Check your balance in a few moments.");
            } else {
              setBannerMessage("⚠️ Payment received but recharge is pending confirmation. Please check back shortly or contact support.");
            }
          })
          .catch(() => {
            setBannerMessage("⚠️ Payment received. Recharge is being processed in the background.");
          });

        // Clean URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      } else if (paymentStatus === "recharge_cancelled") {
        setBannerMessage("ℹ️ Recharge payment was cancelled. No charge was made.");
        // Clean URL
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }
    }
  }, []);

  const { user: authUser, customerData, fetchUser, logout: authLogout } = useAuthStore();
  const { numbers: storeNumbers, loading: storeLoading, fetchAvailableNumbers } = useNumberStore();

  useEffect(() => {
    fetchUser();
    fetchAvailableNumbers();
  }, []);

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
      if (customerData?.numbers) {
        setMyNumbers(customerData.numbers);
      }
    }
  }, [authUser, customerData]);

  useEffect(() => {
    // Always sync store numbers to local state (even when empty)
    setNumbers(storeNumbers as any);
  }, [storeNumbers]);

  const fetchUserSession = async () => {
    await fetchUser();
  };

  const fetchCatalog = async () => {
    await fetchAvailableNumbers();
  };

  // Fetch User's Orders
  const fetchMyOrders = async () => {
    if (!user?.customerId) return;
    setLoadingMyData(true);
    try {
      const res = await fetch(`/api/orders?customerId=${user.customerId}`);
      if (res.ok) {
        const data = await res.json();
        setMyOrders(data.orders || []);
      }
    } catch (e) {
      console.error("Failed to fetch orders:", e);
    } finally {
      setLoadingMyData(false);
    }
  };

  // Fetch User's Payments & Recharges
  const fetchMyPayments = async () => {
    if (!user?.customerId) return;
    setLoadingMyData(true);
    try {
      const res = await fetch(`/api/payments?customerId=${user.customerId}`);
      if (res.ok) {
        const data = await res.json();
        setMyPayments(data.payments || []);
        setMyRecharges(data.recharges || []);
      }
    } catch (e) {
      console.error("Failed to fetch payments & recharges:", e);
    } finally {
      setLoadingMyData(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, []);

  useEffect(() => {
    if (activeTab === "orders") {
      fetchMyOrders();
    } else if (activeTab === "payments") {
      fetchMyPayments();
    } else if (activeTab === "my-numbers") {
      fetchUserSession();
    }
  }, [activeTab, user?.customerId]);

  // Fetch live balances for ACTIVE numbers (ICC, ICON, and RANKS ITT)
  const fetchIccBalances = async (numbers: MyNumberItem[]) => {
    const activeNumbers = numbers.filter(
      (n) =>
        (n.provider?.code === "ICC" ||
          n.provider?.code === "ICON" ||
          n.provider?.code === "RANKSITT" ||
          n.displayCompany?.code === "09639" ||
          n.displayCompany?.code === "09644" ||
          n.displayCompany?.code === "09617" ||
          n.number.startsWith("09639") ||
          n.number.startsWith("09644") ||
          n.number.startsWith("09617")) &&
        n.status === "ACTIVE"
    );
    if (activeNumbers.length === 0) return;

    await Promise.all(
      activeNumbers.map(async (num) => {
        try {
          const isIcon =
            num.provider?.code === "ICON" ||
            num.displayCompany?.code === "09644" ||
            num.number.startsWith("09644");
          const isRanksitt =
            num.provider?.code === "RANKSITT" ||
            num.displayCompany?.code === "09617" ||
            num.number.startsWith("09617");
          const endpoint = isRanksitt
            ? "/api/ranksitt-balance"
            : isIcon
              ? "/api/icon-balance"
              : "/api/icc-balance";
          const res = await fetch(`${endpoint}?pin=${encodeURIComponent(num.number)}&_t=${Date.now()}`);
          if (res.ok) {
            const data = await res.json();
            setIccBalances((prev) => ({ ...prev, [num.number]: data.balance }));
            if (data.updatedAt) {
              setBalanceUpdatedTimes((prev) => ({ ...prev, [num.number]: data.updatedAt }));
            }
          } else {
            setIccBalances((prev) => ({ ...prev, [num.number]: null }));
          }
        } catch {
          setIccBalances((prev) => ({ ...prev, [num.number]: null }));
        }
      })
    );
  };

  useEffect(() => {
    fetchIccBalances(myNumbers);
  }, [myNumbers]);

  // Refresh handler for My Numbers & Wallets tab
  const handleRefreshMyNumbers = async () => {
    setIsRefreshing(true);
    try {
      await fetchUserSession();
      const currentList = customerData?.numbers || myNumbers;
      await fetchIccBalances(currentList);
    } catch (e) {
      console.error("Failed to refresh balances:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    if (user?.isImpersonated) {
      try {
        await fetch("/api/admin/impersonate/leave", { method: "POST", credentials: "include" });
      } catch {}
      if (typeof document !== "undefined") {
        document.cookie = "impersonation_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      }
      window.location.href = "/admin/customers";
      return;
    }
    await authLogout();
    setUser(null);
    setMyNumbers([]);
    setMyOrders([]);
    router.push("/login");
  };

  // Filter numbers based on prefix and search query
  const filteredNumbers = numbers.filter((num) => {
    const matchesPrefix =
      selectedPrefix === "ALL" ||
      num.displayCompany?.code === selectedPrefix ||
      num.number.startsWith(selectedPrefix);
    const matchesSearch =
      !searchQuery ||
      num.number.includes(searchQuery) ||
      (num.displayCompany?.name &&
        num.displayCompany.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesPrefix && matchesSearch;
  });

  // Handle Buy Now
  const handleInitiateBuy = async (item: NumberItem) => {
    if (!user) {
      router.push("/login");
      return;
    }
    setPurchasingNumber(item);
    setCheckoutError("");
  };

  // Execute Order Creation & PipraPay Checkout (or free instant claim)
  const handleConfirmOrder = async () => {
    if (!purchasingNumber || !user) return;
    setIsProcessingCheckout(true);
    setCheckoutError("");

    try {
      // 1. Create Order & Reserve Number
      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: user.customerId,
          numberIds: [purchasingNumber.id],
          notes: `Purchase of ${purchasingNumber.number} via Portal`,
          reservationMinutes: 15,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) {
        throw new Error(orderData.error || "Failed to reserve number");
      }

      const orderId = orderData.order.id;

      // 2a. FREE number (0 BDT) — bypass payment gateway entirely
      if (Number(purchasingNumber.salePrice || 0) <= 0) {
        const freeRes = await fetch(`/api/orders/${orderId}/complete-free`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const freeData = await freeRes.json();
        if (!freeRes.ok || !freeData.success) {
          throw new Error(freeData.error || "Failed to claim free number");
        }
        // Refresh user session to pick up the new number in My Numbers
        await fetchUser();
        setPurchasingNumber(null);
        setActiveTab("my-numbers");
        setBannerMessage("🎉 Free number claimed successfully! Your number has been assigned.");
        setIsProcessingCheckout(false);
        return;
      }

      // 2b. Paid number — Initiate real PipraPay Checkout Session
      const payRes = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          customerId: user.customerId,
          amount: Number(purchasingNumber.salePrice),
        }),
      });

      const payData = await payRes.json();
      if (!payRes.ok || !payData.success) {
        throw new Error(payData.error || "Failed to generate payment session");
      }

      // 3. Redirect to payment gateway URL (PipraPay / Sandbox)
      if (payData.paymentUrl) {
        window.location.href = payData.paymentUrl;
      } else {
        throw new Error("No payment URL received");
      }
    } catch (err: any) {
      setCheckoutError(err?.message || "Checkout failed");
      setIsProcessingCheckout(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-main)",
        color: "var(--text-main)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Top Navigation Bar */}
      <header
        style={{
          height: "64px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "var(--sky-indigo)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "14px",
                color: "#ffffff",
              }}
            >
              📱
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.02em", color: "var(--text-heading)" }}>
                Number Sale Portal
              </div>
              <div style={{ fontSize: "10.5px", color: "var(--text-dim)" }}>Softcents Ecosystem</div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav style={{ display: "flex", gap: "6px", marginLeft: "20px" }}>
            <button
              onClick={() => setActiveTab("catalog")}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: activeTab === "catalog" ? "var(--sky-indigo)" : "transparent",
                color: activeTab === "catalog" ? "#ffffff" : "var(--text-muted)",
                border: activeTab === "catalog" ? "none" : "1px solid transparent",
                boxShadow: activeTab === "catalog" ? "0 2px 8px rgba(2, 132, 199, 0.25)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              🛍️ Available Numbers
            </button>
            <button
              onClick={() => {
                if (!user) router.push("/login");
                else setActiveTab("my-numbers");
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: activeTab === "my-numbers" ? "var(--sky-indigo)" : "transparent",
                color: activeTab === "my-numbers" ? "#ffffff" : "var(--text-muted)",
                border: activeTab === "my-numbers" ? "none" : "1px solid transparent",
                boxShadow: activeTab === "my-numbers" ? "0 2px 8px rgba(2, 132, 199, 0.25)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              📱 My Numbers & Wallets
            </button>
            <button
              onClick={() => {
                if (!user) router.push("/login");
                else setActiveTab("orders");
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: activeTab === "orders" ? "var(--sky-indigo)" : "transparent",
                color: activeTab === "orders" ? "#ffffff" : "var(--text-muted)",
                border: activeTab === "orders" ? "none" : "1px solid transparent",
                boxShadow: activeTab === "orders" ? "0 2px 8px rgba(2, 132, 199, 0.25)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              📋 My Orders
            </button>
            <button
              onClick={() => {
                if (!user) router.push("/login");
                else setActiveTab("payments");
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600,
                background: activeTab === "payments" ? "var(--sky-indigo)" : "transparent",
                color: activeTab === "payments" ? "#ffffff" : "var(--text-muted)",
                border: activeTab === "payments" ? "none" : "1px solid transparent",
                boxShadow: activeTab === "payments" ? "0 2px 8px rgba(2, 132, 199, 0.25)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              💳 Payment History
            </button>
          </nav>
        </div>

        {/* Right header actions: User profile & 9-dot launcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Link
            href="/provider-register"
            style={{
              fontSize: "12px",
              padding: "6px 14px",
              borderRadius: "6px",
              background: "var(--emerald-light)",
              color: "#065f46",
              border: "1px solid var(--emerald-border)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontWeight: 600,
            }}
          >
            <span>⚡ Provider Register</span>
          </Link>

          <Link
            href="/admin"
            style={{
              fontSize: "12px",
              padding: "6px 14px",
              borderRadius: "6px",
              background: "var(--bg-beige)",
              color: "var(--text-purple)",
              border: "1px solid var(--border-subtle)",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Admin Panel →
          </Link>

          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 12px",
                  borderRadius: "999px",
                  background: "var(--bg-beige)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  color: "var(--text-main)",
                }}
              >
                <div
                  style={{
                    width: "22px",
                    height: "22px",
                    borderRadius: "50%",
                    background: "var(--sky-indigo)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "11px",
                  }}
                >
                  {user.fullName ? user.fullName[0].toUpperCase() : "U"}
                </div>
                <span style={{ fontWeight: 600, color: "var(--text-heading)" }}>{user.fullName || user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  background: user?.isImpersonated ? "var(--rose-light)" : "transparent",
                  border: user?.isImpersonated ? "1px solid var(--rose-border)" : "none",
                  borderRadius: user?.isImpersonated ? "6px" : "0",
                  color: "var(--rose)",
                  fontSize: "12px",
                  fontWeight: user?.isImpersonated ? 600 : 500,
                  cursor: "pointer",
                  padding: user?.isImpersonated ? "4px 10px" : "4px 8px",
                  transition: "all 0.15s ease",
                }}
                title={user?.isImpersonated ? "Exit customer session and return to admin panel" : "Sign out"}
              >
                {user?.isImpersonated ? "Exit Impersonation →" : "Sign Out"}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "12.5px",
                fontWeight: 600,
                background: "var(--sky-indigo)",
                color: "#ffffff",
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
              }}
            >
              Sign In (Central Identity)
            </Link>
          )}

          {/* Google-Style 9-Dot App Launcher */}
          <AppLauncher currentAppId="number-sale" />
        </div>
      </header>

      {/* Main Body Content */}
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Banner Message */}
        {bannerMessage && (
          <div
            style={{
              padding: "12px 18px",
              borderRadius: "10px",
              background: "var(--emerald-light)",
              border: "1px solid var(--emerald-border)",
              color: "#065f46",
              fontSize: "13.5px",
              fontWeight: 500,
              marginBottom: "24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{bannerMessage}</span>
            <button
              onClick={() => setBannerMessage(null)}
              style={{ background: "none", border: "none", color: "#065f46", cursor: "pointer", fontSize: "16px", fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ─── TAB 1: BROWSE CATALOG ─── */}
        {activeTab === "catalog" && (
          <div>
            <div style={{ marginBottom: "28px" }}>
              <h1 style={{ fontSize: "26px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-heading)" }}>
                Available Virtual & IP Numbers
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
                Select an exclusive number, reserve instantly, and pay securely via PipraPay.
              </p>
            </div>

            {/* Filter Bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "24px",
                padding: "16px 20px",
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              {/* Prefix Pills */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  { label: "All Prefixes", val: "ALL" },
                  { label: "09639", val: "09639" },
                  { label: "09644", val: "09644" },
                  { label: "09617", val: "09617" },
                ].map((p) => (
                  <button
                    key={p.val}
                    onClick={() => setSelectedPrefix(p.val)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background: selectedPrefix === p.val ? "var(--sky-indigo)" : "var(--bg-beige)",
                      color: selectedPrefix === p.val ? "#ffffff" : "var(--text-main)",
                      border: selectedPrefix === p.val ? "none" : "1px solid var(--border-subtle)",
                      boxShadow: selectedPrefix === p.val ? "0 2px 8px rgba(2, 132, 199, 0.25)" : "none",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div style={{ position: "relative", minWidth: "260px" }}>
                <input
                  type="text"
                  placeholder="Search number pattern..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 14px",
                    background: "#ffffff",
                    border: "1px solid var(--border-medium)",
                    borderRadius: "8px",
                    color: "var(--text-main)",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Numbers Grid */}
            {loadingNumbers ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                Loading available numbers...
              </div>
            ) : filteredNumbers.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  background: "#ffffff",
                  borderRadius: "14px",
                  border: "1px dashed var(--border-subtle)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>🔍</div>
                <h3 style={{ fontSize: "16px", color: "var(--text-heading)", margin: "0 0 6px 0" }}>No numbers found</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: 0 }}>
                  Try choosing a different prefix or clearing your search filter.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "16px",
                }}
              >
                {filteredNumbers.map((num) => (
                  <div
                    key={num.id}
                    style={{
                      background: "#ffffff",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "14px",
                      padding: "20px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      boxShadow: "var(--shadow-card)",
                      transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--primary)";
                      e.currentTarget.style.boxShadow = "var(--shadow-hover)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-subtle)";
                      e.currentTarget.style.boxShadow = "var(--shadow-card)";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "12px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: "var(--sky-blue-light)",
                            color: "#0369a1",
                            border: "1px solid #bae6fd",
                          }}
                        >
                          {num.displayCompany?.code || (num.number.startsWith("09644") ? "09644" : num.number.startsWith("09617") ? "09617" : "09639")}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "999px",
                            background: "var(--emerald-light)",
                            color: "#065f46",
                            border: "1px solid var(--emerald-border)",
                            fontWeight: 600,
                          }}
                        >
                          Available
                        </span>
                      </div>

                      <div
                        style={{
                          fontFamily: "monospace",
                          fontSize: "18px",
                          fontWeight: 700,
                          color: "var(--text-heading)",
                          letterSpacing: "0.05em",
                          marginBottom: "6px",
                        }}
                      >
                        {num.number}
                      </div>

                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
                        Prefix {num.displayCompany?.code || num.number.slice(0, 5)} • {num.numberType}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: "14px",
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>One-time Price</div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--emerald)" }}>
                          {Number(num.salePrice ?? 0) <= 0 ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ background: "var(--emerald-light)", color: "#065f46", border: "1px solid var(--emerald-border)", padding: "2px 7px", borderRadius: "5px", fontSize: "11px", fontWeight: 700 }}>FREE</span>
                              <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>৳ 0 BDT</span>
                            </span>
                          ) : (
                            `৳ ${Number(num.salePrice).toFixed(0)} BDT`
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleInitiateBuy(num)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "8px",
                          background: "var(--sky-indigo)",
                          color: "#ffffff",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          border: "none",
                          cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                        }}
                      >
                        {Number(num.salePrice ?? 0) <= 0 ? "Claim Free" : "Buy Now"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 2: MY NUMBERS & WALLETS ─── */}
        {activeTab === "my-numbers" && (
          <div>
            <div style={{ marginBottom: "28px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "26px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-heading)" }}>
                  My Numbers &amp; Wallets
                </h1>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
                  Every active number comes with an isolated BDT prepaid ledger.
                </p>
              </div>
              <button
                id="refresh-my-numbers-btn"
                onClick={handleRefreshMyNumbers}
                disabled={isRefreshing}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "9px 18px",
                  borderRadius: "10px",
                  background: isRefreshing
                    ? "var(--bg-beige)"
                    : "var(--sky-light)",
                  color: isRefreshing ? "var(--text-dim)" : "var(--sky-blue)",
                  border: "1px solid var(--sky-border)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isRefreshing ? "not-allowed" : "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    animation: isRefreshing ? "spin 0.8s linear infinite" : "none",
                    fontSize: "15px",
                    lineHeight: 1,
                  }}
                >
                  ↻
                </span>
                {isRefreshing ? "Refreshing…" : "Refresh Balance"}
              </button>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>

            {myNumbers.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  background: "var(--bg-card)",
                  borderRadius: "14px",
                  border: "1px dashed var(--border-subtle)",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>📱</div>
                <h3 style={{ fontSize: "16px", color: "var(--text-heading)", margin: "0 0 6px 0" }}>
                  You don't own any numbers yet
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "0 0 20px 0" }}>
                  Browse our available number catalog and activate your first line.
                </p>
                <button
                  onClick={() => setActiveTab("catalog")}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    background: "var(--sky-indigo)",
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: "13px",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                  }}
                >
                  Browse Catalog
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "16px" }}>
                {myNumbers.map((num) => (
                  <div
                    key={num.id}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "14px",
                      padding: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "16px",
                      boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "18px",
                            fontWeight: 700,
                            color: "var(--text-heading)",
                          }}
                        >
                          {num.number}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background:
                              num.status === "ACTIVE"
                                ? "var(--emerald-light)"
                                : num.status === "PROCESSING"
                                  ? "var(--sky-light)"
                                  : "#fff1f2",
                            color:
                              num.status === "ACTIVE"
                                ? "#065f46"
                                : num.status === "PROCESSING"
                                  ? "var(--sky-blue)"
                                  : "#991b1b",
                            border: `1px solid ${
                              num.status === "ACTIVE"
                                ? "var(--emerald-border)"
                                : num.status === "PROCESSING"
                                  ? "var(--sky-border)"
                                  : "#fecaca"
                            }`,
                            fontWeight: 600,
                          }}
                        >
                          {num.status === "PROCESSING" ? "Activating with Network..." : num.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Prefix: {num.displayCompany?.code || (num.number.startsWith("09644") ? "09644" : num.number.startsWith("09617") ? "09617" : "09639")} • Activated on{" "}
                        {new Date(num.createdAt).toLocaleDateString()}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                      <div style={{ textAlign: "right" }}>
                        {/* Single unified Wallet Balance: ICC live balance perceived as the wallet balance */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", marginBottom: "2px" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Wallet Balance</span>
                          <button
                            onClick={handleRefreshMyNumbers}
                            disabled={isRefreshing}
                            title="Refresh balance"
                            style={{
                              background: "none",
                              border: "none",
                              color: isRefreshing ? "var(--sky-blue)" : "var(--text-dim)",
                              cursor: isRefreshing ? "not-allowed" : "pointer",
                              padding: "0 2px",
                              display: "inline-flex",
                              alignItems: "center",
                              fontSize: "12px",
                              lineHeight: 1,
                              transition: "color 0.15s ease",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--sky-blue)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = isRefreshing ? "var(--sky-blue)" : "var(--text-dim)"; }}
                          >
                            <span style={{ display: "inline-block", animation: isRefreshing ? "spin 0.8s linear infinite" : "none" }}>↻</span>
                          </button>
                        </div>
                        <div style={{ fontSize: "20px", fontWeight: 700, color: "#059669" }}>
                          {(() => {
                            const isLiveBalanceNumber =
                              num.provider?.code === "ICC" ||
                              num.provider?.code === "ICON" ||
                              num.provider?.code === "RANKSITT" ||
                              num.displayCompany?.code === "09639" ||
                              num.displayCompany?.code === "09644" ||
                              num.displayCompany?.code === "09617" ||
                              num.number.startsWith("09639") ||
                              num.number.startsWith("09644") ||
                              num.number.startsWith("09617");
                            if (isLiveBalanceNumber) {
                              const bal = iccBalances[num.number];
                              if (bal === undefined) return "Loading…";
                              if (bal === null) return `৳ ${Number(num.wallet?.balance || 0).toFixed(2)} BDT`;
                              // If value has fractional parts beyond cents, show up to 4 decimals, else 2 decimals
                              const numVal = Number(bal);
                              const formatted = numVal % 0.01 !== 0 ? numVal.toFixed(4) : numVal.toFixed(2);
                              return `৳ ${formatted} BDT`;
                            }
                            return `৳ ${Number(num.wallet?.balance || 0).toFixed(2)} BDT`;
                          })()}
                        </div>
                        {(() => {
                          const updateTime = balanceUpdatedTimes[num.number] || (num.wallet as any)?.updatedAt;
                          if (!updateTime) return null;
                          try {
                            const d = new Date(updateTime);
                            return (
                              <div style={{ fontSize: "10.5px", color: "var(--text-dim)", marginTop: "2px" }}>
                                Updated {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                              </div>
                            );
                          } catch {
                            return null;
                          }
                        })()}
                      </div>

                      <button
                        onClick={() => {
                          handleOpenTopUpModal(num);
                        }}
                        style={{
                          padding: "9px 18px",
                          borderRadius: "8px",
                          background: "var(--sky-indigo)",
                          color: "#ffffff",
                          border: "none",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                        }}
                      >
                        + Top Up via PipraPay
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 3: MY ORDERS ─── */}
        {activeTab === "orders" && (
          <div>
            <div style={{ marginBottom: "28px" }}>
              <h1 style={{ fontSize: "26px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-heading)" }}>My Orders</h1>
              <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
                Track payment verification and number activation status.
              </p>
            </div>

            {loadingMyData ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                Loading your orders...
              </div>
            ) : myOrders.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 20px",
                  background: "var(--bg-card)",
                  borderRadius: "14px",
                  border: "1px dashed var(--border-subtle)",
                }}
              >
                <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
                <h3 style={{ fontSize: "16px", color: "var(--text-heading)", margin: 0 }}>No orders placed yet</h3>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {myOrders.map((ord) => (
                  <div
                    key={ord.id}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "12px",
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>
                          {ord.orderNumber}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "999px",
                            background:
                              ord.status === "PAID"
                                ? "var(--emerald-light)"
                                : ord.status === "PENDING"
                                  ? "var(--amber-light)"
                                  : "#fff1f2",
                            color:
                              ord.status === "PAID"
                                ? "#065f46"
                                : ord.status === "PENDING"
                                  ? "#b45309"
                                  : "#991b1b",
                            border: `1px solid ${
                              ord.status === "PAID"
                                ? "var(--emerald-border)"
                                : ord.status === "PENDING"
                                  ? "var(--amber-border)"
                                  : "#fecaca"
                            }`,
                          }}
                        >
                          {ord.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {new Date(ord.createdAt).toLocaleString()} •{" "}
                        {ord.items?.map((i) => i.number.number).join(", ") || "1 item"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-heading)" }}>
                        ৳ {Number(ord.totalAmount).toFixed(2)} BDT
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>PipraPay Verified</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB 4: PAYMENT HISTORY & RECHARGE HISTORY ─── */}
        {activeTab === "payments" && (
          <div>
            {/* Top Heading & View Filters */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "16px",
                marginBottom: "24px",
              }}
            >
              <div>
                <h1 style={{ fontSize: "26px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-heading)" }}>
                  Payment &amp; Recharge History
                </h1>
                <p style={{ color: "var(--text-muted)", fontSize: "14px", margin: 0 }}>
                  Every number acquisition payment, top-up recharge, and balance transaction event is permanently logged.
                </p>
              </div>

              {/* View Switcher: Side-by-Side vs Filtered */}
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--bg-beige)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "3px",
                  gap: "4px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setPaymentViewFilter("side-by-side")}
                  style={{
                    background: paymentViewFilter === "side-by-side" ? "var(--sky-indigo)" : "transparent",
                    color: paymentViewFilter === "side-by-side" ? "#ffffff" : "var(--text-muted)",
                    border: "none",
                    borderRadius: "7px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ⊞ Side-by-Side
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentViewFilter("purchases")}
                  style={{
                    background: paymentViewFilter === "purchases" ? "var(--sky-indigo)" : "transparent",
                    color: paymentViewFilter === "purchases" ? "#ffffff" : "var(--text-muted)",
                    border: "none",
                    borderRadius: "7px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  💳 Number Purchases ({myPayments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentViewFilter("recharges")}
                  style={{
                    background: paymentViewFilter === "recharges" ? "var(--indigo)" : "transparent",
                    color: paymentViewFilter === "recharges" ? "#ffffff" : "var(--text-muted)",
                    border: "none",
                    borderRadius: "7px",
                    padding: "6px 14px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  ⚡ Recharge History ({myRecharges.length})
                </button>
              </div>
            </div>

            {/* Quick KPI Stat Strip */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
                marginBottom: "24px",
              }}
            >
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Number Acquisitions
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--sky-blue)", marginTop: "4px" }}>
                  {myPayments.length} <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 400 }}>orders</span>
                </div>
              </div>

              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Top-Up Recharges
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#b45309", marginTop: "4px" }}>
                  {myRecharges.length} <span style={{ fontSize: "12px", color: "var(--text-dim)", fontWeight: 400 }}>top-ups</span>
                </div>
              </div>

              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Total Recharged Amount
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#059669", marginTop: "4px" }}>
                  ৳{" "}
                  {myRecharges
                    .filter((r) => r.isSuccess)
                    .reduce((acc, r) => acc + (r.amount || 0), 0)
                    .toFixed(2)}{" "}
                  <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 400 }}>BDT</span>
                </div>
              </div>

              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "14px 18px",
                  boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
                }}
              >
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
                  Recharge Success Rate
                </div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-heading)", marginTop: "4px" }}>
                  {myRecharges.length > 0
                    ? Math.round((myRecharges.filter((r) => r.isSuccess).length / myRecharges.length) * 100) + "%"
                    : "100%"}
                  <span style={{ fontSize: "11px", color: "#059669", marginLeft: "8px", fontWeight: 600 }}>
                    ({myRecharges.filter((r) => r.isSuccess).length} / {myRecharges.length} Succeeded)
                  </span>
                </div>
              </div>
            </div>

            {loadingMyData ? (
              <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
                <div style={{ display: "inline-block", width: "32px", height: "32px", border: "3px solid var(--sky-light)", borderTopColor: "var(--sky-blue)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <p style={{ marginTop: "14px", fontSize: "14px" }}>Loading payment &amp; recharge transaction history…</p>
              </div>
            ) : (
              /* The Side-by-Side Dual-Grid Layout */
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    paymentViewFilter === "side-by-side"
                      ? "repeat(auto-fit, minmax(460px, 1fr))"
                      : "1fr",
                  gap: "24px",
                  alignItems: "start",
                }}
              >
                {/* ========================================================================= */}
                {/* COLUMN 1: NUMBER ACQUIRING & CHECKOUT PAYMENTS                            */}
                {/* ========================================================================= */}
                {(paymentViewFilter === "side-by-side" || paymentViewFilter === "purchases") && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "16px",
                      padding: "20px",
                      boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    {/* Column Header */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "16px",
                        paddingBottom: "14px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "10px",
                            background: "var(--sky-light)",
                            border: "1px solid var(--sky-border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "16px",
                          }}
                        >
                          💳
                        </div>
                        <div>
                          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-heading)", margin: 0 }}>
                            Number Purchases &amp; Checkout Payments
                          </h2>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Acquired numbers &amp; gateway invoices
                          </span>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          background: "var(--sky-light)",
                          color: "var(--sky-blue)",
                          border: "1px solid var(--sky-border)",
                          padding: "3px 10px",
                          borderRadius: "999px",
                        }}
                      >
                        {myPayments.length} Records
                      </span>
                    </div>

                    {myPayments.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "50px 20px",
                          background: "var(--bg-beige-subtle)",
                          borderRadius: "12px",
                          border: "1px dashed var(--border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "32px", marginBottom: "8px" }}>💳</div>
                        <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0 }}>
                          No number purchase records found
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {myPayments.map((pay: any) => (
                          <div
                            key={pay.id}
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "12px",
                              padding: "16px 18px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: "12px",
                              transition: "all 0.15s ease",
                              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.02)",
                            }}
                          >
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "5px" }}>
                                <span style={{ fontFamily: "monospace", fontSize: "13px", fontWeight: 700, color: "var(--text-heading)" }}>
                                  #{pay.id.slice(0, 10).toUpperCase()}
                                </span>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    borderRadius: "999px",
                                    fontWeight: 600,
                                    background:
                                      pay.status === "COMPLETED"
                                        ? "var(--emerald-light)"
                                        : pay.status === "PENDING"
                                          ? "var(--amber-light)"
                                          : "#fff1f2",
                                    color:
                                      pay.status === "COMPLETED"
                                        ? "#065f46"
                                        : pay.status === "PENDING"
                                          ? "#b45309"
                                          : "#991b1b",
                                    border: `1px solid ${
                                      pay.status === "COMPLETED"
                                        ? "var(--emerald-border)"
                                        : pay.status === "PENDING"
                                          ? "var(--amber-border)"
                                          : "#fecaca"
                                    }`,
                                  }}
                                >
                                  {pay.status === "COMPLETED" ? "Paid" : pay.status}
                                </span>
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                {new Date(pay.createdAt).toLocaleString()} •{" "}
                                {pay.isRecharge ? "Prepaid Wallet Recharge" : `Order ${pay.orderNumber || ""}`} •{" "}
                                Gateway: <span style={{ color: "var(--text-main)", fontWeight: 500 }}>{pay.gateway}</span>
                              </div>
                            </div>

                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "16px", fontWeight: 700, color: "#059669" }}>
                                ৳ {pay.amount.toFixed(2)} {pay.currency}
                              </div>
                              <div style={{ fontSize: "11px", color: "var(--text-dim)", fontFamily: "monospace" }}>
                                Txn: {pay.gatewayTransactionId || "—"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ========================================================================= */}
                {/* COLUMN 2: NUMBER TOP-UP & RECHARGE BALANCE HISTORY                         */}
                {/* ========================================================================= */}
                {(paymentViewFilter === "side-by-side" || paymentViewFilter === "recharges") && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "16px",
                      padding: "20px",
                      boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
                    }}
                  >
                    {/* Column Header */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "16px",
                        paddingBottom: "14px",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "10px",
                            background: "var(--amber-light)",
                            border: "1px solid var(--amber-border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "16px",
                          }}
                        >
                          ⚡
                        </div>
                        <div>
                          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-heading)", margin: 0 }}>
                            Number Top-Up &amp; Recharge History
                          </h2>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Carrier pin recharges with balance before &amp; after
                          </span>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          background: "var(--amber-light)",
                          color: "#b45309",
                          border: "1px solid var(--amber-border)",
                          padding: "3px 10px",
                          borderRadius: "999px",
                        }}
                      >
                        {myRecharges.length} Records
                      </span>
                    </div>

                    {myRecharges.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "50px 20px",
                          background: "var(--bg-beige-subtle)",
                          borderRadius: "12px",
                          border: "1px dashed var(--border-subtle)",
                        }}
                      >
                        <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚡</div>
                        <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: 0 }}>
                          No top-up recharge records found for your numbers yet
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {myRecharges.map((rech: any) => (
                          <div
                            key={rech.id}
                            style={{
                              background: "var(--bg-card)",
                              border: "1px solid var(--border-subtle)",
                              borderRadius: "12px",
                              padding: "16px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                              transition: "all 0.15s ease",
                              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.02)",
                            }}
                          >
                            {/* Top Card Row: Phone Number & Status Badge */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span
                                  style={{
                                    fontFamily: "monospace",
                                    fontSize: "14px",
                                    fontWeight: 700,
                                    color: "#b45309",
                                    background: "var(--amber-light)",
                                    border: "1px solid var(--amber-border)",
                                    padding: "2px 8px",
                                    borderRadius: "6px",
                                  }}
                                >
                                  📱 {rech.phone}
                                </span>
                                {rech.displayCompany && (
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: 600,
                                      color: "var(--sky-blue)",
                                      background: "var(--sky-light)",
                                      padding: "2px 6px",
                                      borderRadius: "4px",
                                    }}
                                  >
                                    {rech.displayCompany}
                                  </span>
                                )}
                              </div>

                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "3px 10px",
                                  borderRadius: "999px",
                                  fontWeight: 700,
                                  background: rech.isSuccess
                                    ? "var(--emerald-light)"
                                    : rech.rawStatus === "ERROR"
                                      ? "#fff1f2"
                                      : rech.rawStatus === "UNCERTAIN"
                                        ? "var(--amber-light)"
                                        : "var(--sky-light)",
                                  color: rech.isSuccess
                                    ? "#065f46"
                                    : rech.rawStatus === "ERROR"
                                      ? "#991b1b"
                                      : rech.rawStatus === "UNCERTAIN"
                                        ? "#b45309"
                                        : "var(--sky-blue)",
                                  border: `1px solid ${rech.isSuccess
                                      ? "var(--emerald-border)"
                                      : rech.rawStatus === "ERROR"
                                        ? "#fecaca"
                                        : rech.rawStatus === "UNCERTAIN"
                                          ? "var(--amber-border)"
                                          : "var(--sky-border)"
                                    }`,
                                }}
                              >
                                {rech.isSuccess ? "✓ Success" : rech.status}
                              </span>
                            </div>

                            {/* Customer & Allocation Metadata */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "10px",
                                fontSize: "11px",
                                color: "var(--text-muted)",
                                background: "var(--bg-beige-subtle)",
                                border: "1px solid var(--border-subtle)",
                                padding: "6px 10px",
                                borderRadius: "6px",
                              }}
                            >
                              <span>
                                👤 Recharged by: <strong style={{ color: "var(--text-heading)" }}>{rech.customerName}</strong>
                              </span>
                              {rech.customerEmail && <span>• ✉ {rech.customerEmail}</span>}
                              {rech.companyName && (
                                <span style={{ color: "var(--sky-blue)", fontWeight: 600 }}>
                                  • 🏢 {rech.companyName}
                                </span>
                              )}
                            </div>

                            {/* 3-Cell Visual Balance Breakdown (Before, Top-Up, After) */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr 1fr",
                                gap: "8px",
                                background: "var(--bg-beige-subtle)",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "8px",
                                padding: "8px 12px",
                                textAlign: "center",
                              }}
                            >
                              <div>
                                <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 600 }}>
                                  Previous Balance
                                </div>
                                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)", fontFamily: "monospace", marginTop: "2px" }}>
                                  ৳ {rech.balanceBefore !== null ? rech.balanceBefore.toFixed(2) : "—"}
                                </div>
                              </div>

                              <div style={{ borderLeft: "1px solid var(--border-subtle)", borderRight: "1px solid var(--border-subtle)" }}>
                                <div style={{ fontSize: "10px", color: "#b45309", textTransform: "uppercase", fontWeight: 600 }}>
                                  Top-Up Balance
                                </div>
                                <div style={{ fontSize: "14px", fontWeight: 700, color: "#059669", fontFamily: "monospace", marginTop: "2px" }}>
                                  + ৳ {rech.amount.toFixed(2)}
                                </div>
                              </div>

                              <div>
                                <div style={{ fontSize: "10px", color: "var(--text-dim)", textTransform: "uppercase", fontWeight: 600 }}>
                                  Balance After
                                </div>
                                <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--sky-blue)", fontFamily: "monospace", marginTop: "2px" }}>
                                  ৳ {rech.balanceAfter !== null ? rech.balanceAfter.toFixed(2) : "—"}
                                </div>
                              </div>
                            </div>

                            {/* Failure Cause Banner (if failure or reason exists) */}
                            {!rech.isSuccess && rech.reason && (
                              <div
                                style={{
                                  background: "#fff1f2",
                                  border: "1px solid #fecaca",
                                  borderRadius: "6px",
                                  padding: "6px 10px",
                                  color: "#991b1b",
                                  fontSize: "11px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <span>⚠️</span>
                                <span>
                                  Cause of Failure: <strong style={{ color: "#7f1d1d" }}>{rech.reason}</strong>
                                </span>
                              </div>
                            )}

                            {/* Footer Date & Reference info */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                fontSize: "11px",
                                color: "var(--text-dim)",
                                borderTop: "1px solid var(--border-subtle)",
                                paddingTop: "8px",
                              }}
                            >
                              <span>{new Date(rech.createdAt).toLocaleString()}</span>
                              <span style={{ fontFamily: "monospace" }}>
                                Ref: {rech.reference || rech.jobId ? (rech.jobId ? rech.jobId.slice(0, 10) : rech.id.slice(0, 10)) : rech.id.slice(0, 10)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── PURCHASE / CHECKOUT MODAL ─── */}
      {purchasingNumber && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid var(--border-subtle)",
              borderRadius: "18px",
              padding: "28px",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "var(--shadow-modal)",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text-heading)" }}>
              Confirm Number Purchase
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 20px 0" }}>
              Reserving number for 15 minutes while payment is completed.
            </p>

            <div
              style={{
                background: "var(--bg-beige-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                padding: "16px",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Number:</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--text-heading)" }}>
                  {purchasingNumber.number}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Prefix Code:</span>
                <span style={{ fontSize: "12px", color: "var(--sky-blue)", fontWeight: 600 }}>
                  {purchasingNumber.displayCompany?.code || purchasingNumber.number.slice(0, 5)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: "8px",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-heading)" }}>Payable Amount:</span>
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#059669" }}>
                  {Number(purchasingNumber.salePrice ?? 0) <= 0
                    ? "৳ 0.00 BDT (FREE)"
                    : `৳ ${Number(purchasingNumber.salePrice).toFixed(2)} BDT`}
                </span>
              </div>
            </div>

            {checkoutError && (
              <div
                style={{
                  padding: "10px",
                  borderRadius: "8px",
                  background: "#fff1f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  fontSize: "12px",
                  marginBottom: "16px",
                }}
              >
                {checkoutError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setPurchasingNumber(null)}
                disabled={isProcessingCheckout}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  background: "var(--bg-beige)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-main)",
                  fontSize: "13px",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrder}
                disabled={isProcessingCheckout}
                style={{
                  flex: 2,
                  padding: "10px",
                  borderRadius: "8px",
                  background: "var(--sky-indigo)",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: isProcessingCheckout ? "not-allowed" : "pointer",
                  opacity: isProcessingCheckout ? 0.7 : 1,
                  boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                }}
              >
                {isProcessingCheckout
                  ? (Number(purchasingNumber?.salePrice ?? 0) <= 0 ? "Claiming Free Number…" : "Redirecting to PipraPay…")
                  : (Number(purchasingNumber?.salePrice ?? 0) <= 0 ? "Claim for Free ✓" : "Proceed to PipraPay →")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── AUTOMATED ICC TALK TOP UP MODAL ─── */}
      {topUpModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#ffffff",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid var(--border-subtle)",
              borderRadius: "20px",
              padding: "28px",
              maxWidth: "440px",
              width: "100%",
              boxShadow: "var(--shadow-modal)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "19px", fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-heading)" }}>
                  Top Up Calling Balance
                </h3>
                <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: 0 }}>
                  Automated instant recharge for <span style={{ fontFamily: "monospace", color: "var(--sky-blue)", fontWeight: 600 }}>{topUpModal.phone}</span>
                </p>
              </div>
              {topUpStage === "input" && (
                <button
                  onClick={() => setTopUpModal(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    fontSize: "20px",
                    cursor: "pointer",
                    padding: "0 4px",
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Current Balance Banner */}
            <div
              style={{
                background: "var(--bg-beige-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "12px",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Current Balance</span>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#059669" }}>
                ৳ {topUpModal.currentBalance.toFixed(2)} BDT
              </span>
            </div>

            {/* STAGE: INPUT */}
            {topUpStage === "input" && (
              <>
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", color: "var(--text-heading)", fontWeight: 600, marginBottom: "6px" }}>
                    Top Up Amount (BDT)
                  </label>
                  <input
                    type="number"
                    value={topUpAmount}
                    onChange={(e) => {
                      setTopUpAmount(e.target.value);
                      setTopUpError("");
                    }}
                    min="1"
                    max="5000"
                    placeholder="Enter amount (1 - 5000)"
                    style={{
                      width: "100%",
                      padding: "11px 14px",
                      background: "#ffffff",
                      border: "1px solid var(--border-medium)",
                      borderRadius: "10px",
                      color: "var(--text-main)",
                      fontSize: "15px",
                      boxSizing: "border-box",
                      outline: "none",
                    }}
                  />
                  {topUpError && (
                    <div style={{ fontSize: "11.5px", color: "#dc2626", marginTop: "6px" }}>
                      {topUpError}
                    </div>
                  )}
                </div>

                {/* Quick-Pick Chips */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "6px" }}>Quick Select</div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {["50", "100", "200", "500", "1000"].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => {
                          setTopUpAmount(amt);
                          setTopUpError("");
                        }}
                        style={{
                          flex: 1,
                          padding: "7px 4px",
                          borderRadius: "8px",
                          background: topUpAmount === amt ? "var(--sky-indigo)" : "var(--bg-beige)",
                          color: topUpAmount === amt ? "#ffffff" : "var(--text-main)",
                          border: `1px solid ${topUpAmount === amt ? "transparent" : "var(--border-subtle)"}`,
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        ৳{amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview Line */}
                <div
                  style={{
                    background: "var(--bg-beige-subtle)",
                    border: "1px dashed var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "22px",
                    fontSize: "12.5px",
                  }}
                >
                  <span style={{ color: "var(--text-muted)" }}>New balance will be:</span>
                  <span style={{ fontWeight: 700, color: "var(--sky-blue)" }}>
                    ৳ {(topUpModal.currentBalance + (Number(topUpAmount) || 0)).toFixed(2)} BDT
                  </span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
                  <button
                    onClick={() => setTopUpModal(null)}
                    style={{
                      flex: 1,
                      padding: "11px",
                      borderRadius: "10px",
                      background: "var(--bg-beige)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    id="topup-pay-btn"
                    onClick={handleConfirmTopUp}
                    style={{
                      flex: 2,
                      padding: "11px",
                      borderRadius: "10px",
                      background: "var(--sky-indigo)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <span>💳</span>
                    <span>Pay ৳{topUpAmount || "0"} via PipraPay</span>
                  </button>
                </div>

                {/* Payment notice */}
                <div
                  style={{
                    background: "var(--amber-light)",
                    border: "1px solid var(--amber-border)",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    marginBottom: "14px",
                    fontSize: "11.5px",
                    color: "#92400e",
                    lineHeight: 1.5,
                  }}
                >
                  🔒 You will be redirected to PipraPay to complete payment. Once your payment is confirmed, the recharge will happen automatically.
                </div>

                {/* Recent Recharges Section */}
                {recentRecharges.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "14px", marginTop: "10px" }}>
                    <div style={{ fontSize: "11.5px", color: "var(--text-dim)", fontWeight: 600, marginBottom: "8px" }}>
                      Recent Top Ups
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {recentRecharges.slice(0, 3).map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: "11.5px",
                            padding: "6px 10px",
                            background: "var(--bg-beige-subtle)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "6px",
                          }}
                        >
                          <span style={{ color: "var(--text-muted)" }}>
                            ৳{r.amount.toFixed(2)} • {new Date(r.createdAt).toLocaleDateString()}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 600,
                              color: r.status === "DONE" ? "#065f46" : r.status === "UNCERTAIN" ? "#b45309" : "#991b1b",
                            }}
                          >
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* STAGE: LIVE STEPPER (Connecting, Finding number, Reading balance, Recharging, Verifying) */}
            {["Connecting", "Finding number", "Reading balance", "Recharging", "Verifying"].includes(topUpStage) && (
              <div style={{ padding: "16px 0" }}>
                <div style={{ textAlign: "center", marginBottom: "24px" }}>
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "50%",
                      border: "3px solid var(--sky-light)",
                      borderTopColor: "var(--sky-blue)",
                      margin: "0 auto 14px auto",
                      animation: "spin 0.9s linear infinite",
                    }}
                  />
                  <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-heading)" }}>
                    Processing Top Up…
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>
                    Please wait while the automated billing system updates your number.
                  </div>
                </div>

                {/* Stepper items */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "0 10px" }}>
                  {[
                    "Connecting",
                    "Finding number",
                    "Reading balance",
                    "Recharging",
                    "Verifying",
                  ].map((stepText, idx) => {
                    const stepOrder = ["Connecting", "Finding number", "Reading balance", "Recharging", "Verifying"];
                    const currentIdx = stepOrder.indexOf(topUpStage);
                    const isDone = currentIdx > idx;
                    const isCurrent = currentIdx === idx;

                    return (
                      <div
                        key={stepText}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          fontSize: "12.5px",
                          color: isDone ? "#059669" : isCurrent ? "var(--sky-blue)" : "var(--text-dim)",
                          fontWeight: isCurrent ? 600 : 400,
                        }}
                      >
                        <div
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "11px",
                            background: isDone
                              ? "var(--emerald-light)"
                              : isCurrent
                                ? "var(--sky-light)"
                                : "var(--bg-beige)",
                            border: `1px solid ${isDone ? "var(--emerald-border)" : isCurrent ? "var(--sky-border)" : "var(--border-subtle)"}`,
                          }}
                        >
                          {isDone ? "✓" : idx + 1}
                        </div>
                        <span>{stepText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STAGE: DONE (Green Result Panel) */}
            {topUpStage === "done" && topUpResult && (
              <div style={{ padding: "8px 0" }}>
                <div
                  style={{
                    background: "#ecfdf5",
                    border: "1px solid #a7f3d0",
                    borderRadius: "16px",
                    padding: "20px",
                    textAlign: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div style={{ fontSize: "36px", marginBottom: "8px" }}>🎉</div>
                  <h4 style={{ fontSize: "18px", fontWeight: 700, color: "#065f46", margin: "0 0 4px 0" }}>
                    Top Up Successful!
                  </h4>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
                    Credit has been applied to {topUpModal.phone}
                  </p>

                  {/* Big stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    <div style={{ background: "#ffffff", border: "1px solid #d1fae5", borderRadius: "8px", padding: "10px 4px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>BEFORE</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-heading)", marginTop: "2px" }}>
                        ৳ {topUpResult.balanceBefore?.toFixed(2) ?? "—"}
                      </div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #d1fae5", borderRadius: "8px", padding: "10px 4px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>ADDED</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: "#059669", marginTop: "2px" }}>
                        +৳ {topUpResult.amount?.toFixed(2) ?? topUpAmount}
                      </div>
                    </div>
                    <div style={{ background: "#ffffff", border: "1px solid #d1fae5", borderRadius: "8px", padding: "10px 4px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-dim)" }}>NEW BALANCE</div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: "#059669", marginTop: "2px" }}>
                        ৳ {topUpResult.balanceAfter?.toFixed(2) ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                    {topUpResult.reference && <span>Ref: {topUpResult.reference} • </span>}
                    {topUpResult.durationMs && <span>Time: {(topUpResult.durationMs / 1000).toFixed(2)}s</span>}
                  </div>
                </div>

                <button
                  onClick={() => setTopUpModal(null)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    background: "var(--sky-indigo)",
                    border: "none",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                  }}
                >
                  Done
                </button>
              </div>
            )}

            {/* STAGE: ERROR (Red Result Panel) */}
            {topUpStage === "error" && topUpResult && (
              <div style={{ padding: "8px 0" }}>
                <div
                  style={{
                    background: "#fff1f2",
                    border: "1px solid #fecaca",
                    borderRadius: "16px",
                    padding: "20px",
                    textAlign: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div style={{ fontSize: "36px", marginBottom: "8px" }}>⚠️</div>
                  <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#991b1b", margin: "0 0 6px 0" }}>
                    Top Up Failed
                  </h4>
                  <p style={{ fontSize: "12.5px", color: "#7f1d1d", margin: "0 0 10px 0" }}>
                    {topUpResult.reason}
                  </p>
                  <p style={{ fontSize: "11.5px", color: "var(--text-muted)", margin: 0 }}>
                    Your balance remains unchanged: ৳ {topUpModal.currentBalance.toFixed(2)} BDT
                  </p>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => setTopUpModal(null)}
                    style={{
                      flex: 1,
                      padding: "11px",
                      borderRadius: "10px",
                      background: "var(--bg-beige)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-main)",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      // Reset with fresh idempotency key
                      const freshKey = "topup_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
                      setTopUpModal((prev) => (prev ? { ...prev, idempotencyKey: freshKey } : null));
                      setTopUpStage("input");
                      setTopUpResult(null);
                    }}
                    style={{
                      flex: 2,
                      padding: "11px",
                      borderRadius: "10px",
                      background: "var(--sky-indigo)",
                      border: "none",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                    }}
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* STAGE: UNCERTAIN (Amber Result Panel) */}
            {topUpStage === "uncertain" && topUpResult && (
              <div style={{ padding: "8px 0" }}>
                <div
                  style={{
                    background: "#fffbeb",
                    border: "1px solid #fde68a",
                    borderRadius: "16px",
                    padding: "20px",
                    textAlign: "center",
                    marginBottom: "20px",
                  }}
                >
                  <div style={{ fontSize: "36px", marginBottom: "8px" }}>⏳</div>
                  <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#92400e", margin: "0 0 6px 0" }}>
                    Top Up Unconfirmed
                  </h4>
                  <p style={{ fontSize: "12.5px", color: "#78350f", margin: "0 0 12px 0", lineHeight: 1.4 }}>
                    We could not confirm this top up. <strong>Do not retry.</strong> Support has been notified and our operations team will review it.
                  </p>

                  <div style={{ background: "#ffffff", border: "1px solid #fef3c7", borderRadius: "8px", padding: "10px 14px", textAlign: "left", fontSize: "11.5px", color: "var(--text-muted)", display: "grid", gap: "4px" }}>
                    <div>Balance Before: <strong style={{ color: "var(--text-heading)" }}>৳ {topUpResult.balanceBefore ?? topUpModal.currentBalance} BDT</strong></div>
                    <div>Last Observed: <strong style={{ color: "var(--text-heading)" }}>৳ {topUpResult.balanceAfter ?? topUpModal.currentBalance} BDT</strong></div>
                  </div>
                </div>

                <button
                  onClick={() => setTopUpModal(null)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "10px",
                    background: "var(--amber-light)",
                    border: "1px solid var(--amber-border)",
                    color: "#92400e",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Close &amp; Await Review
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── RECHARGE WALLET MODAL (Original PipraPay modal kept in place but unused) ─── */}
      {rechargeWallet && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              border: "1px solid var(--border-subtle)",
              borderRadius: "18px",
              padding: "28px",
              maxWidth: "380px",
              width: "100%",
              boxShadow: "var(--shadow-modal)",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px 0", color: "var(--text-heading)" }}>Top Up Number Balance</h3>
            <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
              Add prepaid calling credit to {rechargeWallet.number}
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", color: "var(--text-heading)", fontWeight: 600, marginBottom: "6px" }}>
                Recharge Amount (BDT)
              </label>
              <input
                type="number"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                min="50"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  background: "#ffffff",
                  border: "1px solid var(--border-medium)",
                  borderRadius: "8px",
                  color: "var(--text-main)",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              {["100", "200", "500", "1000"].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setRechargeAmount(amt)}
                  style={{
                    flex: 1,
                    padding: "6px",
                    borderRadius: "6px",
                    background: rechargeAmount === amt ? "var(--sky-indigo)" : "var(--bg-beige)",
                    color: rechargeAmount === amt ? "#ffffff" : "var(--text-main)",
                    border: `1px solid ${rechargeAmount === amt ? "transparent" : "var(--border-subtle)"}`,
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ৳{amt}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setRechargeWallet(null)}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  background: "var(--bg-beige)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-main)",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setIsProcessingRecharge(true);
                  try {
                    const payRes = await fetch("/api/payments/checkout", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        customerId: user.customerId,
                        walletId: rechargeWallet.walletId,
                        amount: Number(rechargeAmount),
                      }),
                    });
                    const payData = await payRes.json();
                    if (payData.paymentUrl) {
                      window.location.href = payData.paymentUrl;
                    }
                  } catch (e) {
                    console.error("Recharge error:", e);
                    setIsProcessingRecharge(false);
                  }
                }}
                disabled={isProcessingRecharge}
                style={{
                  flex: 2,
                  padding: "10px",
                  borderRadius: "8px",
                  background: "var(--sky-indigo)",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
                }}
              >
                {isProcessingRecharge ? "Connecting..." : "Pay via PipraPay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
