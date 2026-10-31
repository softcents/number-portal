"use client";

import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

export default function AdminRedirectsPage() {
  const [redirects, setRedirects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchRedirects = () => {
    setIsLoading(true);
    const params = new URLSearchParams({ status: "REDIRECTED" });
    if (searchQuery.trim()) params.set("query", searchQuery.trim());

    fetch(`/api/admin/searches?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setRedirects(data.searches || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch redirects:", err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchRedirects();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRedirects();
  };

  return (
    <AdminLayout
      title="Central Registration Redirects"
      subtitle="Audit logs of non-matching queries routed to the Central Identity Registration Portal"
    >
      <div className="admin-card">
        {/* Info Banner */}
        <div
          style={{
            padding: "16px 20px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.25)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "rgba(245, 158, 11, 0.2)",
              color: "var(--amber)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            ↗
          </div>
          <div>
            <h4 style={{ fontSize: "14px", fontWeight: 600, color: "var(--amber)" }}>
              Routing Target: Central Identity Registration Portal
            </h4>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              When no match is found for a given NID and DOB, the search portal automatically redirects the user to{" "}
              <code style={{ color: "var(--amber)", background: "var(--amber-light)", border: "1px solid var(--amber-border)", padding: "2px 6px", borderRadius: "4px" }}>
                http://138.252.124.48:8080/register
              </code>
              . These records trace every redirected lookup attempt.
            </p>
          </div>
        </div>

        {/* Search header */}
        <div className="admin-card-header">
          <div>
            <h3>Redirect Audit Records ({redirects.length})</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              Log of unsuccessful verification searches that redirected to the external registration workflow
            </p>
          </div>
          <form onSubmit={handleSearchSubmit} className="admin-filter-bar">
            <input
              type="text"
              placeholder="Filter by NID or DOB..."
              className="admin-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                background: "var(--primary)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Filter
            </button>
          </form>
        </div>

        {/* Redirects Table */}
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>NID Number</th>
                <th>Date of Birth</th>
                <th>Redirect Reason</th>
                <th>Destination URL</th>
                <th>Client IP</th>
                <th>Redirect Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "var(--text-dim)" }}>
                    Loading redirect records...
                  </td>
                </tr>
              ) : redirects.length > 0 ? (
                redirects.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "var(--text-main)" }}>{item.nid}</strong>
                    </td>
                    <td>{item.dob}</td>
                    <td>
                      <span className="admin-badge badge-redirected">
                        {item.errorMessage || "No EC Match Found"}
                      </span>
                    </td>
                    <td>
                      <a
                        href="http://138.252.124.48:8080/register"
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--sky-blue)", fontSize: "12px", textDecoration: "none" }}
                      >
                        http://138.252.124.48:8080/register ↗
                      </a>
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                      {item.ipAddress || "127.0.0.1"}
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)" }}>
                    No redirect logs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
