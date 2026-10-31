"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import AdminLayout from "@/components/AdminLayout";
import AdminRecordDetailModal from "@/components/AdminRecordDetailModal";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [modalType, setModalType] = useState<"search" | "submission">("search");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load admin stats:", err);
        setIsLoading(false);
      });
  }, []);

  const openSearchModal = (record: any) => {
    setSelectedRecord(record);
    setModalType("search");
  };

  const openSubmissionModal = (sub: any) => {
    setSelectedRecord(sub);
    setModalType("submission");
  };

  return (
    <AdminLayout
      title="System Overview"
      subtitle="Visual analytics and operational performance counters"
    >
      {/* Visual Numbers Grid */}
      <div className="admin-stats-grid">
        {/* Stat 1: Total Searches */}
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-title">Total Searches</span>
            <div
              className="admin-stat-icon-wrapper"
              style={{ background: "var(--sky-blue-light)", color: "var(--sky-blue)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" x2="16.65" y1="21" y2="16.65" />
              </svg>
            </div>
          </div>
          <div className="admin-stat-value">
            {isLoading ? "—" : stats?.totalSearches ?? 0}
          </div>
          <div className="admin-stat-footer">
            <span>Initiated search queries</span>
          </div>
        </div>

        {/* Stat 2: Matches Found */}
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-title">Matches Found</span>
            <div
              className="admin-stat-icon-wrapper"
              style={{ background: "var(--emerald-light)", color: "var(--emerald)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: "var(--emerald)" }}>
            {isLoading ? "—" : stats?.matchedSearches ?? 0}
          </div>
          <div className="admin-stat-footer">
            <span style={{ color: "var(--emerald)" }}>{stats?.matchRate ?? 0}% match rate</span>
            <span>• Scraped data success</span>
          </div>
        </div>

        {/* Stat 3: No Matches */}
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-title">No Matches / Failed</span>
            <div
              className="admin-stat-icon-wrapper"
              style={{ background: "var(--rose-light)", color: "var(--rose)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" x2="9" y1="9" y2="15" />
                <line x1="9" x2="15" y1="9" y2="15" />
              </svg>
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: "var(--rose)" }}>
            {isLoading ? "—" : stats?.noMatchSearches ?? 0}
          </div>
          <div className="admin-stat-footer">
            <span>No election commission match</span>
          </div>
        </div>

        {/* Stat 4: Redirected to Central Portal */}
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-title">Central Portal Redirects</span>
            <div
              className="admin-stat-icon-wrapper"
              style={{ background: "var(--amber-light)", color: "var(--amber)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
            </div>
          </div>
          <div className="admin-stat-value" style={{ color: "var(--amber)" }}>
            {isLoading ? "—" : stats?.redirectedCount ?? 0}
          </div>
          <div className="admin-stat-footer">
            <span>Sent to registration portal</span>
          </div>
        </div>

        {/* Stat 5: ICC Publishes */}
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <span className="admin-stat-title">ICC Submissions</span>
            <div
              className="admin-stat-icon-wrapper"
              style={{ background: "var(--indigo-light)", color: "var(--indigo)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
              </svg>
            </div>
          </div>
          <div className="admin-stat-value">
            {isLoading ? "—" : stats?.totalSubmissions ?? 0}
          </div>
          <div className="admin-stat-footer">
            <span style={{ color: "var(--emerald)" }}>
              {stats?.successfulSubmissions ?? 0} successful
            </span>
            <span>({stats?.submissionSuccessRate ?? 0}%)</span>
          </div>
        </div>
      </div>

      {/* Number Sale Stats */}
      {stats?.numberSale && (
        <div style={{ marginTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Number Sale</span>
            <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
            {[
              { label: "Total Numbers", val: stats.numberSale.totalNumbers, color: "var(--text-muted)" },
              { label: "Available", val: stats.numberSale.availableNumbers, color: "#059669" },
              { label: "Active", val: stats.numberSale.activeNumbers, color: "#059669" },
              { label: "Reserved", val: stats.numberSale.reservedNumbers, color: "#d97706" },
              { label: "Blocked", val: stats.numberSale.blockedNumbers, color: "var(--text-dim)" },
              { label: "Customers", val: stats.numberSale.totalCustomers, color: "#0284c7" },
              { label: "Providers", val: `${stats.numberSale.activeProviders}/${stats.numberSale.totalProviders}`, color: "#4338ca" },
              { label: "Wallets", val: stats.numberSale.totalWallets, color: "#0891b2" },
              { label: "Orders", val: stats.numberSale.totalOrders, color: "#ffffff" },
              { label: "Completed Orders", val: stats.numberSale.completedOrders, color: "#059669" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "12px 14px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "3px", fontWeight: 500 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two Column Section for Recent Activity */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px", marginTop: "24px" }}>
        {/* Recent Searches */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Recent Searches</h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                Latest NID verification lookups
              </p>
            </div>
            <Link
              href="/admin/searches"
              style={{ fontSize: "12.5px", color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}
            >
              View All Searches →
            </Link>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>NID / DOB</th>
                  <th>Status</th>
                  <th>Redirected</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentSearches && stats.recentSearches.length > 0 ? (
                  stats.recentSearches.map((item: any) => (
                    <tr key={item.id}>
                      <td>
                        <strong style={{ color: "var(--text-main)" }}>{item.nid}</strong>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                          DOB: {item.dob}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`admin-badge ${
                            item.matchFound
                              ? "badge-matched"
                              : item.redirectedToCentral
                              ? "badge-redirected"
                              : "badge-no-match"
                          }`}
                        >
                          {item.matchFound ? "Matched" : item.status === "PENDING" ? "Pending" : "No Match"}
                        </span>
                      </td>
                      <td>
                        {item.redirectedToCentral ? (
                          <span style={{ color: "#d97706", fontSize: "12px", fontWeight: 600 }}>Yes (Portal)</span>
                        ) : (
                          <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>No</span>
                        )}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td>
                        <button
                          onClick={() => openSearchModal(item)}
                          style={{
                            background: "var(--sky-blue-light)",
                            border: "1px solid rgba(2, 132, 199, 0.3)",
                            color: "var(--primary)",
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)" }}>
                      No search records logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent ICC Submissions */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div>
              <h3>Recent ICC Platform Publishes</h3>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                Subscriber registration submissions
              </p>
            </div>
            <Link
              href="/admin/submissions"
              style={{ fontSize: "12.5px", color: "var(--primary)", textDecoration: "none", fontWeight: 500 }}
            >
              View All Publishes →
            </Link>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Subscriber / NID</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentSubmissions && stats.recentSubmissions.length > 0 ? (
                  stats.recentSubmissions.map((sub: any) => (
                    <tr key={sub.id}>
                      <td>
                        <strong style={{ color: "var(--text-main)" }}>
                          {sub.subscriberName || "Unknown"}
                        </strong>
                        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                          NID: {sub.nationalIdNumber || "—"}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`admin-badge ${
                            sub.status === "SUCCESS"
                              ? "badge-success"
                              : sub.status === "FAILED"
                              ? "badge-failed"
                              : "badge-pending"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                        {sub.durationMs ? `${sub.durationMs}ms` : "—"}
                      </td>
                      <td style={{ fontSize: "12px", color: "var(--text-dim)" }}>
                        {new Date(sub.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td>
                        <button
                          onClick={() => openSubmissionModal(sub)}
                          style={{
                            background: "var(--indigo-light)",
                            border: "1px solid rgba(67, 56, 202, 0.3)",
                            color: "var(--indigo)",
                            padding: "4px 10px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "var(--text-dim)" }}>
                      No ICC submissions published yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedRecord && (
        <AdminRecordDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          type={modalType}
        />
      )}
    </AdminLayout>
  );
}
