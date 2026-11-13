"use client";

import React, { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

interface ResellerLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export default function ResellerLayout({ children, title, subtitle }: ResellerLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [reseller, setReseller] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reseller/auth/me")
      .then((res) => {
        if (!res.ok) {
          router.push("/reseller/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && data.authenticated) {
          setReseller(data.reseller);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/reseller/auth/logout", { method: "POST" });
    router.push("/reseller/login");
  };

  const navItems = [
    {
      label: "Dashboard",
      href: "/reseller",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="7" height="9" x="3" y="3" rx="1" />
          <rect width="7" height="5" x="14" y="3" rx="1" />
          <rect width="7" height="9" x="14" y="12" rx="1" />
          <rect width="7" height="5" x="3" y="16" rx="1" />
        </svg>
      ),
    },
    {
      label: "My Customers",
      href: "/reseller/customers",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      label: "Numbers & Pool",
      href: "/reseller/numbers",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="14" height="20" x="5" y="2" rx="2" />
          <path d="M12 18h.01" />
          <path d="M9 7h6" />
          <path d="M9 11h6" />
        </svg>
      ),
    },
    {
      label: "Quick Recharge",
      href: "/reseller/recharges",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
    },
    {
      label: "Wallet & Ledger",
      href: "/reseller/wallet",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
          <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
        </svg>
      ),
    },
    {
      label: "White-Label & Branding",
      href: "/reseller/settings",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  const brandColor = reseller?.brandColor || "#0284c7";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f8fafc", color: "#0f172a", fontFamily: "inherit" }}>
      {/* Top Navbar */}
      <header
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Link href="/reseller" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "inherit" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: `linear-gradient(135deg, ${brandColor} 0%, #0f172a 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "18px",
              }}
            >
              {reseller?.brandName ? reseller.brandName.charAt(0).toUpperCase() : "R"}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>
                {reseller?.brandName || "Reseller Partner Portal"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>
                {reseller?.companyName || "Wholesale Management"}
              </div>
            </div>
          </Link>
        </div>

        {/* Live Wallet & Profile */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Wallet Balance Pill */}
          <Link
            href="/reseller/wallet"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              padding: "6px 14px",
              borderRadius: "999px",
              textDecoration: "none",
            }}
          >
            <span style={{ fontSize: "12px", color: "#166534", fontWeight: 500 }}>Wallet Balance:</span>
            <strong style={{ fontSize: "14px", color: "#15803d" }}>
              ৳{Number(reseller?.balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </strong>
          </Link>

          {/* Wholesale Rates Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#475569" }}>
            <span style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", padding: "4px 8px", borderRadius: "6px", fontWeight: 600 }}>
              Numbers: {reseller?.numberDiscountPercent || 0}% Off
            </span>
            <span style={{ background: "#fef3c7", border: "1px solid #fde68a", color: "#b45309", padding: "4px 8px", borderRadius: "6px", fontWeight: 600 }}>
              Top Up: {reseller?.rechargeDiscountPercent || 0}% Off
            </span>
          </div>

          {/* User & Logout */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{reseller?.username || "Partner"}</div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Reseller Account</div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                padding: "6px 10px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#64748b",
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Container with Sidebar */}
      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar */}
        <aside
          style={{
            width: "240px",
            background: "#ffffff",
            borderRight: "1px solid #e2e8f0",
            padding: "16px 12px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Reseller Navigation
          </div>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 500,
                  textDecoration: "none",
                  background: isActive ? "#f0f9ff" : "transparent",
                  color: isActive ? "#0284c7" : "#475569",
                  borderLeft: isActive ? `3px solid ${brandColor}` : "3px solid transparent",
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div style={{ marginTop: "auto", borderTop: "1px solid #f1f5f9", paddingTop: "14px", paddingLeft: "10px" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8" }}>White-Label Portal:</div>
            <a
              href={`/portal?resellerId=${reseller?.resellerId || ""}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: "4px",
                fontSize: "12px",
                color: "#0284c7",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              👁 Preview Client Portal ↗
            </a>
          </div>
        </aside>

        {/* Content Area */}
        <main style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
          {/* Page Title & Subtitle */}
          <div style={{ marginBottom: "24px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>{title}</h2>
            <p style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>{subtitle}</p>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
