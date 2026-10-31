"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface ImpersonationState {
  isImpersonating: boolean;
  customerId?: string;
  customerName?: string;
  customerEmail?: string;
  adminUsername?: string;
}

export default function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const checkImpersonation = useCallback(() => {
    // 1. Try reading client-accessible impersonation_session cookie
    if (typeof document !== "undefined") {
      const match = document.cookie.match(/(?:^|; )impersonation_session=([^;]*)/);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(decodeURIComponent(match[1]));
          if (parsed && parsed.isImpersonating) {
            setState({
              isImpersonating: true,
              customerId: parsed.customerId,
              customerName: parsed.customerName,
              customerEmail: parsed.customerEmail,
              adminUsername: parsed.adminUsername || "Admin",
            });
            return;
          }
        } catch {
          // ignore parse error
        }
      }
    }

    // 2. Fetch from API endpoint if cookie wasn't present or expired
    fetch("/api/admin/impersonate", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.isImpersonating) {
          setState({
            isImpersonating: true,
            customerId: data.customer?.id,
            customerName: data.customer?.fullName,
            customerEmail: data.customer?.email,
            adminUsername: data.impersonatedBy?.adminUsername || "Admin",
          });
        } else {
          setState(null);
        }
      })
      .catch(() => {
        setState(null);
      });
  }, []);

  useEffect(() => {
    checkImpersonation();
  }, [checkImpersonation, pathname]);

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      const res = await fetch("/api/admin/impersonate/leave", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setState(null);

      // Force immediate client-side cookie eviction to prevent any banner ghosting/lag
      if (typeof document !== "undefined") {
        document.cookie = "impersonation_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      }

      if (data?.redirectTo) {
        window.location.href = data.redirectTo;
      } else {
        window.location.href = "/admin/customers";
      }
    } catch (err) {
      console.error("Failed to leave impersonation:", err);
      if (typeof document !== "undefined") {
        document.cookie = "impersonation_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      }
      window.location.href = "/admin/customers";
    }
  };

  if (!state || !state.isImpersonating) {
    return null;
  }

  return (
    <div
      role="banner"
      aria-label="User Impersonation Warning"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 99999,
        background: "#fff1f2",
        borderBottom: "1px solid #fecaca",
        boxShadow: "0 2px 8px rgba(220, 38, 38, 0.08)",
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "12.5px",
        color: "#991b1b",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        {/* Animated Amber/Red Pulse Dot */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "999px",
            padding: "2px 8px",
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#991b1b",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#dc2626",
              boxShadow: "0 0 6px rgba(220, 38, 38, 0.6)",
              display: "inline-block",
            }}
          />
          Impersonation Active
        </span>

        {/* Customer Info */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "#7f1d1d" }}>
            You are logged in as customer:
          </span>
          <strong style={{ color: "#ffffff", fontWeight: 700 }}>
            {state.customerName || "Customer"}
          </strong>
          {state.customerEmail && (
            <span style={{ color: "var(--text-muted)", fontSize: "11.5px" }}>
              ({state.customerEmail})
            </span>
          )}
        </div>

        {/* Admin context */}
        {state.adminUsername && (
          <span
            style={{
              fontSize: "11px",
              color: "#991b1b",
              background: "#ffffff",
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid #fecaca",
              fontWeight: 600,
            }}
          >
            Admin: {state.adminUsername}
          </span>
        )}
      </div>

      {/* Action Buttons */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {pathname.startsWith("/admin") && (
          <a
            href="/portal"
            style={{
              background: "var(--sky-blue-light)",
              color: "#0369a1",
              border: "1px solid #bae6fd",
              borderRadius: "6px",
              padding: "5px 12px",
              fontSize: "12px",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              cursor: "pointer",
            }}
            title="Switch to Customer Portal view"
          >
            <span>📱 Go to Portal</span>
          </a>
        )}

        <button
          onClick={handleLeave}
          disabled={isLeaving}
          style={{
            background: "linear-gradient(135deg, #ef4444, #dc2626)",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            padding: "5px 14px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: isLeaving ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            boxShadow: "0 2px 8px rgba(239, 68, 68, 0.35)",
            transition: "all 0.15s ease",
            opacity: isLeaving ? 0.7 : 1,
          }}
          title="Exit impersonation and return to Admin Panel"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>{isLeaving ? "Exiting..." : "Leave Impersonation"}</span>
        </button>
      </div>
    </div>
  );
}
