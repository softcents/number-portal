"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AppLauncher from "@/components/AppLauncher";

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
}

export default function AdminLayout({ children, title, subtitle }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    router.push("/admin/login");
  };

  const verificationNav = [
    {
      label: "Dashboard",
      href: "/admin",
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
      label: "Search Logs",
      href: "/admin/searches",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" x2="16.65" y1="21" y2="16.65" />
        </svg>
      ),
    },
    {
      label: "Matched Data",
      href: "/admin/matches",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      label: "ICC Publishes",
      href: "/admin/submissions",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        </svg>
      ),
    },
  ];

  const numberSaleNav = [
    {
      label: "Numbers",
      href: "/admin/numbers",
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
      label: "Providers",
      href: "/admin/providers",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
        </svg>
      ),
    },
    {
      label: "Users & Customers",
      href: "/admin/customers",
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
      label: "Wallets",
      href: "/admin/wallets",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
          <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
        </svg>
      ),
    },
    {
      label: "Orders",
      href: "/admin/orders",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      label: "Payments",
      href: "/admin/payments",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="5" rx="2" />
          <line x1="2" x2="22" y1="10" y2="10" />
        </svg>
      ),
    },
    {
      label: "ICC Top Ups",
      href: "/admin/recharges",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <div className="bg-ambient" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />

      <div className="admin-shell">
        {/* Sidebar Navigation */}
        <aside className="admin-sidebar">
          <div className="admin-sidebar-header">
            <div className="brand-icon" style={{ width: "32px", height: "32px" }}>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div className="admin-sidebar-brand">
              <h2>Data Verification</h2>
              <span>Admin Control</span>
            </div>
          </div>

          <nav className="admin-nav-menu">
            <div style={{ padding: "4px 12px 6px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>Verification</div>
            {verificationNav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-item ${isActive ? "active" : ""}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <div style={{ height: "1px", background: "var(--border-subtle)", margin: "8px 12px" }} />
            <div style={{ padding: "4px 12px 6px", fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" }}>Number Sale</div>
            {numberSaleNav.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + "/") ||
                (item.href === "/admin/customers" && pathname.startsWith("/admin/users"));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`admin-nav-item ${isActive ? "active" : ""}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="admin-sidebar-footer">
            <Link
              href="/"
              className="admin-nav-item"
              style={{ padding: "8px 12px", fontSize: "12.5px" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>Back to Portal</span>
            </Link>
            <button
              onClick={handleLogout}
              className="admin-nav-item"
              style={{
                padding: "8px 12px",
                fontSize: "12.5px",
                color: "var(--rose)",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                width: "100%",
                justifyContent: "flex-start",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" x2="9" y1="12" y2="12" />
              </svg>
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="admin-main">
          <header className="admin-topbar">
            <div className="admin-topbar-title">
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="admin-topbar-actions">
              <div className="status-badge">
                <span className="status-dot" />
                <span>Live System</span>
              </div>
              <Link
                href="/portal"
                style={{
                  fontSize: "12px",
                  padding: "6px 14px",
                  borderRadius: "6px",
                  background: "var(--sky-blue-light)",
                  color: "#0369a1",
                  border: "1px solid #bae6fd",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontWeight: 600,
                }}
              >
                <span>📱 Number Shop</span>
              </Link>
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "5px 12px",
                  background: "var(--bg-beige)",
                  borderRadius: "var(--radius-full)",
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
                    fontSize: "11px",
                    fontWeight: 700,
                  }}
                >
                  A
                </div>
                <span style={{ fontWeight: 600, color: "var(--text-heading)" }}>Admin</span>
              </div>
              <AppLauncher currentAppId="reports" />
            </div>
          </header>

          <main className="admin-content-body">{children}</main>
        </div>
      </div>
    </>
  );
}
