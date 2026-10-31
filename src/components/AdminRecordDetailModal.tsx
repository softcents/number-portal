"use client";

import React from "react";

interface AdminRecordDetailModalProps {
  record: any;
  onClose: () => void;
  type?: "search" | "submission";
}

export default function AdminRecordDetailModal({
  record,
  onClose,
  type = "search",
}: AdminRecordDetailModalProps) {
  if (!record) return null;

  const isSearch = type === "search";
  const profile = record.matchedProfile || record.allFormFields;

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="admin-modal-header">
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-heading)" }}>
              {isSearch ? "Verification Search Record" : "ICC Submission Record"}
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              ID: {record.id} • {new Date(record.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--bg-beige)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-main)",
              width: "28px",
              height: "28px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            ✕
          </button>
        </div>

        <div className="admin-modal-body">
          {/* Status & Core Meta */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            {isSearch ? (
              <>
                <span
                  className={`admin-badge ${
                    record.matchFound
                      ? "badge-matched"
                      : record.redirectedToCentral
                      ? "badge-redirected"
                      : "badge-no-match"
                  }`}
                >
                  {record.matchFound
                    ? "Match Found"
                    : record.redirectedToCentral
                    ? "Redirected to Central Portal"
                    : "No Match"}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  NID: <strong style={{ color: "var(--text-main)" }}>{record.nid}</strong>
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  DOB: <strong style={{ color: "var(--text-main)" }}>{record.dob}</strong>
                </span>
              </>
            ) : (
              <>
                <span
                  className={`admin-badge ${
                    record.status === "SUCCESS"
                      ? "badge-success"
                      : record.status === "FAILED"
                      ? "badge-failed"
                      : "badge-pending"
                  }`}
                >
                  {record.status}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Subscriber:{" "}
                  <strong style={{ color: "var(--text-main)" }}>
                    {record.subscriberName || "N/A"}
                  </strong>
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  NID:{" "}
                  <strong style={{ color: "var(--text-main)" }}>
                    {record.nationalIdNumber || "N/A"}
                  </strong>
                </span>
                {record.durationMs && (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Duration:{" "}
                    <strong style={{ color: "var(--text-main)" }}>
                      {record.durationMs}ms
                    </strong>
                  </span>
                )}
              </>
            )}
          </div>

          {/* Photos and Identity Documents */}
          <div>
            <h4
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-muted)",
                marginBottom: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Identity Photos & Documents
            </h4>
            <div className="admin-photo-grid">
              {record.photoUrl ? (
                <div className="admin-photo-box">
                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Live Photo</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.photoUrl}
                    alt="Live Photo"
                    className="admin-photo-img"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--emerald)", fontWeight: 600 }}>Scraped Photo Attached</span>
                </div>
              ) : (
                <div className="admin-photo-box" style={{ justifyContent: "center" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>Live Photo</span>
                  <div
                    style={{
                      height: "100px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-dim)",
                      fontSize: "12px",
                    }}
                  >
                    No photo attached
                  </div>
                </div>
              )}

              {record.documentUrl ? (
                <div className="admin-photo-box">
                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>NID Document (Front)</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.documentUrl}
                    alt="NID Document Front"
                    className="admin-photo-img"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>Document Front Attached</span>
                </div>
              ) : (
                <div className="admin-photo-box" style={{ justifyContent: "center" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>NID Document (Front)</span>
                  <div
                    style={{
                      height: "100px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-dim)",
                      fontSize: "12px",
                    }}
                  >
                    No document attached
                  </div>
                </div>
              )}

              {record.documentBackUrl && (
                <div className="admin-photo-box">
                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>NID Document (Back)</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={record.documentBackUrl}
                    alt="NID Document Back"
                    className="admin-photo-img"
                  />
                  <span style={{ fontSize: "11px", color: "var(--primary)", fontWeight: 600 }}>Document Back Attached</span>
                </div>
              )}
            </div>
          </div>

          {/* Matched / Scraped Data Fields */}
          {profile && (
            <div>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {isSearch ? "Scraped Details from EC Records" : "Submitted Form Fields to ICC"}
              </h4>

              <div className="admin-detail-grid">
                {Object.entries(profile).map(([key, value]) => {
                  if (typeof value === "object" && value !== null) return null;
                  return (
                    <div key={key} className="admin-detail-item">
                      <div className="admin-detail-label">
                        {key.replace(/([A-Z])/g, " $1")}
                      </div>
                      <div className="admin-detail-value">{String(value || "—")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* User Manually Filled vs Scraped Comparison */}
          {record.userFilledFields && (
            <div>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                User-Filled / Modified Fields
              </h4>
              <div className="admin-detail-grid">
                {Object.entries(record.userFilledFields).map(([key, value]) => (
                  <div key={key} className="admin-detail-item" style={{ borderColor: "rgba(2, 132, 199, 0.2)" }}>
                    <div className="admin-detail-label" style={{ color: "var(--primary)" }}>
                      {key.replace(/([A-Z])/g, " $1")}
                    </div>
                    <div className="admin-detail-value">{String(value || "—")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-filled field list */}
          {record.filledFields && record.filledFields.length > 0 && (
            <div>
              <h4
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Scraper Auto-Filled Fields ({record.filledFields.length})
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {record.filledFields.map((field: string) => (
                  <span
                    key={field}
                    style={{
                      fontSize: "11.5px",
                      padding: "3px 8px",
                      background: "var(--emerald-light)",
                      border: "1px solid var(--emerald-border)",
                      borderRadius: "4px",
                      color: "#065f46",
                      fontWeight: 600,
                    }}
                  >
                    ✓ {field}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
