"use client";

import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import AdminRecordDetailModal from "@/components/AdminRecordDetailModal";

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const fetchSubmissions = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (searchQuery.trim()) params.set("query", searchQuery.trim());

    fetch(`/api/admin/submissions?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setSubmissions(data.submissions || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch submissions:", err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchSubmissions();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSubmissions();
  };

  return (
    <AdminLayout
      title="ICC Platform Publishes"
      subtitle="Complete audit trail of all subscriber records published and submitted to the ICC platform"
    >
      <div className="admin-card">
        {/* Filter and Search Bar */}
        <div className="admin-card-header">
          <form onSubmit={handleSearchSubmit} className="admin-filter-bar">
            <input
              type="text"
              placeholder="Search by Subscriber, NID, or Phone..."
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

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Status:</span>
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Submissions</option>
              <option value="SUCCESS">Published (Success)</option>
              <option value="FAILED">Failed</option>
              <option value="SUBMITTING">Submitting</option>
            </select>
          </div>
        </div>

        {/* Submissions Table */}
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subscriber Name</th>
                <th>NID Number</th>
                <th>Phone Number</th>
                <th>Connection Type</th>
                <th>Publish Status</th>
                <th>Duration</th>
                <th>Timestamp</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "28px", color: "var(--text-dim)" }}>
                    Loading ICC platform submissions...
                  </td>
                </tr>
              ) : submissions.length > 0 ? (
                submissions.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "var(--text-main)" }}>
                        {item.subscriberName || "Unknown"}
                      </strong>
                      <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                        {item.subscriberType || "Individual"}
                      </div>
                    </td>
                    <td>{item.nationalIdNumber || "—"}</td>
                    <td>{item.phoneNumber || "—"}</td>
                    <td>
                      <span
                        style={{
                          fontSize: "11.5px",
                          padding: "3px 8px",
                          borderRadius: "4px",
                          background: "var(--bg-beige)",
                          color: "var(--text-main)",
                          border: "1px solid var(--border-subtle)",
                          fontWeight: 500,
                        }}
                      >
                        {item.connection || "Prepaid"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`admin-badge ${
                          item.status === "SUCCESS"
                            ? "badge-success"
                            : item.status === "FAILED"
                            ? "badge-failed"
                            : "badge-pending"
                        }`}
                      >
                        {item.status === "SUCCESS" ? "✓ Published" : item.status}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                      {item.durationMs ? `${item.durationMs}ms` : "—"}
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedRecord(item)}
                        style={{
                          background: "var(--sky-blue-light)",
                          border: "1px solid rgba(2, 132, 199, 0.3)",
                          color: "var(--primary)",
                          padding: "5px 12px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)" }}>
                    No ICC submissions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedRecord && (
        <AdminRecordDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          type="submission"
        />
      )}
    </AdminLayout>
  );
}
