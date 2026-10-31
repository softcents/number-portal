"use client";

import React, { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import AdminRecordDetailModal from "@/components/AdminRecordDetailModal";

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);

  const fetchMatches = () => {
    setIsLoading(true);
    const params = new URLSearchParams({ status: "MATCHED" });
    if (searchQuery.trim()) params.set("query", searchQuery.trim());

    fetch(`/api/admin/searches?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setMatches(data.searches || []);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch matches:", err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMatches();
  };

  return (
    <AdminLayout
      title="Matched Data Records"
      subtitle="Complete profile dossiers, scraped details, and identity documents brought from election commission records"
    >
      <div className="admin-card">
        {/* Search header */}
        <div className="admin-card-header">
          <div>
            <h3>Scraped & Matched Profiles ({matches.length})</h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              Identity records successfully retrieved and matched by NID & DOB
            </p>
          </div>
          <form onSubmit={handleSearchSubmit} className="admin-filter-bar">
            <input
              type="text"
              placeholder="Search by Name, NID, or DOB..."
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
              Search
            </button>
          </form>
        </div>

        {/* Matches Grid */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
            Loading matched data records...
          </div>
        ) : matches.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "20px" }}>
            {matches.map((item) => {
              const p = item.matchedProfile || {};
              return (
                <div
                  key={item.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                    position: "relative",
                  }}
                >
                  {/* Card Header with Photo Thumbnail */}
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "10px",
                        background: "var(--bg-beige-subtle)",
                        border: "1px solid var(--border-subtle)",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {item.photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={item.photoUrl}
                          alt="Thumbnail"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: "20px" }}>👤</span>
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4
                        style={{
                          fontSize: "15px",
                          fontWeight: 700,
                          color: "var(--text-main)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.name || "Identified Individual"}
                      </h4>
                      {p.nameBangla && (
                        <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>{p.nameBangla}</p>
                      )}
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                        <span className="admin-badge badge-matched" style={{ fontSize: "10.5px" }}>
                          ✓ EC Matched
                        </span>
                        {p.bloodGroup && (
                          <span
                            style={{
                              fontSize: "10.5px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "var(--rose)",
                            }}
                          >
                            🩸 {p.bloodGroup}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary Details */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "8px",
                      fontSize: "12px",
                      background: "rgba(11, 17, 33, 0.6)",
                      padding: "10px",
                      borderRadius: "6px",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--text-dim)" }}>NID:</span>{" "}
                      <strong style={{ color: "var(--text-main)" }}>{item.nid}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-dim)" }}>DOB:</span>{" "}
                      <strong style={{ color: "var(--text-main)" }}>{item.dob}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-dim)" }}>Father:</span>{" "}
                      <span style={{ color: "var(--text-main)" }}>{p.father || "—"}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-dim)" }}>Mother:</span>{" "}
                      <span style={{ color: "var(--text-main)" }}>{p.mother || "—"}</span>
                    </div>
                  </div>

                  {/* Present Address preview */}
                  {p.presentAddress && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      <span style={{ color: "var(--text-dim)" }}>Present Address: </span>
                      {p.presentAddress}
                    </div>
                  )}

                  {/* Auto-filled tags */}
                  {item.filledFields && (
                    <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
                      {item.filledFields.length} fields auto-populated into subscriber form
                    </div>
                  )}

                  {/* Inspect Button */}
                  <button
                    onClick={() => setSelectedRecord(item)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      background: "linear-gradient(135deg, rgba(79, 70, 229, 0.2), rgba(37, 99, 235, 0.2))",
                      border: "1px solid rgba(99, 102, 241, 0.4)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--indigo)",
                      fontSize: "12.5px",
                      fontWeight: 600,
                      cursor: "pointer",
                      marginTop: "auto",
                    }}
                  >
                    View Full Dossier & Photos →
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>
            No matched profile records found.
          </div>
        )}
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
