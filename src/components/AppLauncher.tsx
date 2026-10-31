"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ECOSYSTEM_APPS, EcosystemApp } from "@/lib/ecosystemApps";

interface AppLauncherProps {
  currentAppId?: string;
}

export default function AppLauncher({ currentAppId = "number-sale" }: AppLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {/* 9-Dot Grid Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        title="Softcents Apps Launcher"
        aria-label="Softcents Apps Launcher"
        aria-expanded={isOpen}
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isOpen ? "var(--bg-beige)" : "#ffffff",
          border: "1px solid var(--border-subtle)",
          cursor: "pointer",
          transition: "all 0.18s ease",
          color: "var(--text-main)",
          outline: "none",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-beige)";
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.background = "#ffffff";
        }}
      >
        {/* Google 9-dot icon SVG */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="12" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
        </svg>
      </button>

      {/* Floating 9-Dot App Grid Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "46px",
            right: "0",
            width: "320px",
            background: "#ffffff",
            border: "1px solid var(--border-subtle)",
            borderRadius: "16px",
            boxShadow: "var(--shadow-dropdown)",
            padding: "16px",
            zIndex: 1000,
            animation: "fadeInDown 0.18s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "12px",
              marginBottom: "12px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-heading)", letterSpacing: "0.02em" }}>
                Softcents Central Apps
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>One Account • Single Sign-On</div>
            </div>
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "999px",
                background: "var(--sky-blue-light)",
                color: "#0369a1",
                border: "1px solid #bae6fd",
              }}
            >
              SSO Active
            </span>
          </div>

          {/* 3-Column Apps Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "8px",
            }}
          >
            {ECOSYSTEM_APPS.map((app) => {
              const isCurrent = app.id === currentAppId;

              return (
                <Link
                  key={app.id}
                  href={app.href}
                  onClick={() => setIsOpen(false)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "12px 6px",
                    borderRadius: "12px",
                    textDecoration: "none",
                    background: isCurrent ? "var(--primary-light)" : "var(--bg-beige-subtle)",
                    border: isCurrent
                      ? "1px solid rgba(2, 132, 199, 0.35)"
                      : "1px solid var(--border-subtle)",
                    transition: "all 0.15s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isCurrent
                      ? "var(--primary-light)"
                      : "var(--bg-card-hover)";
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isCurrent
                      ? "var(--primary-light)"
                      : "var(--bg-beige-subtle)";
                    e.currentTarget.style.borderColor = isCurrent
                      ? "rgba(2, 132, 199, 0.35)"
                      : "var(--border-subtle)";
                    e.currentTarget.style.transform = "none";
                  }}
                >
                  <div style={{ fontSize: "24px", marginBottom: "6px" }}>{app.icon}</div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: isCurrent ? "var(--primary)" : "var(--text-main)",
                      textAlign: "center",
                      lineHeight: "1.2",
                      maxHeight: "28px",
                      overflow: "hidden",
                    }}
                  >
                    {app.name}
                  </div>
                  {isCurrent && (
                    <span
                      style={{
                        marginTop: "4px",
                        fontSize: "9px",
                        fontWeight: 700,
                        color: "var(--primary)",
                        textTransform: "uppercase",
                      }}
                    >
                      Active
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          <div
            style={{
              marginTop: "14px",
              paddingTop: "10px",
              borderTop: "1px solid var(--border-subtle)",
              textAlign: "center",
            }}
          >
            <a
              href="http://138.252.124.48:8080"
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "11.5px",
                color: "var(--primary)",
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              Manage your Central Account →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
