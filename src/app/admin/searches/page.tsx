"use client";

import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import AdminRecordDetailModal from "@/components/AdminRecordDetailModal";

export default function AdminSearchesPage() {
  const [searches, setSearches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const fetchSearches = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (searchQuery.trim()) params.set("query", searchQuery.trim());

    fetch(`/api/admin/searches?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setSearches(data.searches || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch searches:", err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchSearches();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSearches();
  };

  return (
    <AdminLayout
      title="Search Logs & Records"
      subtitle="Complete history of all identity verification attempts and lookup results"
    >
      <div className="admin-card">
        {/* Filter and Search Bar */}
        <div className="admin-card-header">
          <form onSubmit={handleSearchSubmit} className="admin-filter-bar">
            <input
              type="text"
              placeholder="Search by NID, DOB, or Name..."
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
              <option value="ALL">All Records</option>
              <option value="MATCHED">Matched</option>
              <option value="NO_MATCH">No Match</option>
              <option value="REDIRECTED">Redirected to Central</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
        </div>

        {/* Searches Table */}
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>NID Number</th>
                <th>Date of Birth</th>
                <th>Result Status</th>
                <th>Redirected to Central</th>
                <th>IP Address</th>
                <th>Timestamp</th>
                <th>Inspection</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "28px", color: "var(--text-dim)" }}>
                    Loading search records...
                  </td>
                </tr>
              ) : searches.length > 0 ? (
                searches.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "var(--text-main)" }}>{item.nid}</strong>
                      {item.matchedProfile?.name && (
                        <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                          {item.matchedProfile.name}
                        </div>
                      )}
                    </td>
                    <td>{item.dob}</td>
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
                        {item.matchFound ? "Match Found" : item.status === "PENDING" ? "Pending" : "No Match"}
                      </span>
                    </td>
                    <td>
                      {item.redirectedToCentral ? (
                        <span style={{ color: "var(--amber)", fontWeight: 500 }}>
                          ↗ Yes (Registration Portal)
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-dim)" }}>No</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                      {item.ipAddress || "127.0.0.1"}
                    </td>
                    <td style={{ color: "var(--text-dim)", fontSize: "12px" }}>
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <button
                        onClick={() => setSelectedRecord(item)}
                        style={{
                          background: "rgba(59, 130, 246, 0.15)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          color: "var(--sky-blue)",
                          padding: "5px 12px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          cursor: "pointer",
                          fontWeight: 500,
                        }}
                      >
                        Inspect Record
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)" }}>
                    No search records found matching the criteria.
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
          type="search"
        />
      )}
    </AdminLayout>
  );
}
