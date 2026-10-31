"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminLayout from "@/components/AdminLayout";
import Link from "next/link";

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  AVAILABLE:  { bg: "var(--emerald-light)", color: "var(--emerald)", border: "var(--emerald-border)" },
  RESERVED:   { bg: "var(--amber-light)", color: "var(--amber)", border: "var(--amber-border)" },
  PROCESSING: { bg: "var(--sky-blue-light)", color: "var(--sky-blue)", border: "rgba(2, 132, 199, 0.3)" },
  ACTIVE:     { bg: "var(--emerald-light)", color: "var(--emerald)", border: "var(--emerald-border)" },
  SUSPENDED:  { bg: "var(--rose-light)", color: "var(--rose)", border: "var(--rose-border)" },
  BLOCKED:    { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" },
  RELEASED:   { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" },
  FAILED:     { bg: "var(--rose-light)", color: "var(--rose)", border: "var(--rose-border)" },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" };
  return (
    <span
      style={{
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
      }}
    >
      {status}
    </span>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "3px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>
        {label}
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-main)", fontWeight: 500 }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function NumberDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [num, setNum] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/admin/numbers/${id}`).then(r => r.json()),
      fetch(`/api/admin/numbers/${id}/history`).then(r => r.json()),
    ]).then(([numData, histData]) => {
      setNum(numData);
      setHistory(Array.isArray(histData) ? histData : []);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <AdminLayout title="Number Detail" subtitle="Loading…">
        <p style={{ color: "var(--text-dim)", padding: "20px" }}>Loading…</p>
      </AdminLayout>
    );
  }

  if (!num || num.error) {
    return (
      <AdminLayout title="Not Found" subtitle="">
        <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
          <p style={{ color: "var(--rose)", fontWeight: 600, marginBottom: "12px" }}>Number not found.</p>
          <Link href="/admin/numbers" style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}>
            ← Back to Numbers
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={num.number} subtitle={`Number detail — ${num.status}`}>
      <div style={{ marginBottom: "16px" }}>
        <Link href="/admin/numbers" style={{ fontSize: "12.5px", color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
          ← Back to Numbers
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "20px" }}>
        {/* Left: details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Core info */}
          <div style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <span style={{ fontFamily: "monospace", fontSize: "24px", fontWeight: 700, color: "var(--text-heading)" }}>
                {num.number}
              </span>
              <StatusBadge status={num.status} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "16px" }}>
              <Field label="Normalized" value={<span style={{ fontFamily: "monospace", fontSize: "12px" }}>{num.normalizedNumber}</span>} />
              <Field label="Type" value={num.numberType} />
              <Field label="Country" value={`${num.countryCode} ${num.country}`} />
              <Field label="City" value={num.city} />
              <Field label="Area" value={num.area} />
              <Field label="Provider (Internal)" value={num.provider ? <span style={{ fontFamily: "monospace", color: "var(--indigo)", fontWeight: 600 }}>{num.provider.code}</span> : "—"} />
              <Field label="Display Code (Customer)" value={num.displayCompany ? <span style={{ fontFamily: "monospace", color: "var(--emerald)", fontWeight: 600 }}>{num.displayCompany.code}</span> : "—"} />
              <Field label="Cost Price" value={num.costPrice ? `৳${Number(num.costPrice).toFixed(2)}` : "—"} />
              <Field label="Sale Price" value={num.salePrice ? `৳${Number(num.salePrice).toFixed(2)}` : "—"} />
              <Field label="Call Rate" value={num.callRate ? `${num.callRate} BDT/min` : "—"} />
              <Field label="Added" value={new Date(num.createdAt).toLocaleString()} />
              <Field label="Updated" value={new Date(num.updatedAt).toLocaleString()} />
            </div>
            {num.notes && (
              <div style={{ marginTop: "16px", padding: "12px 14px", background: "var(--bg-beige)", border: "1px solid var(--border-subtle)", borderRadius: "8px", fontSize: "12px", color: "var(--text-main)" }}>
                <strong>Notes:</strong> {num.notes}
              </div>
            )}
          </div>

          {/* Customer */}
          {num.customer && (
            <div style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-purple)", marginBottom: "14px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Assigned Customer
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="Name" value={num.customer.fullName} />
                <Field label="Email" value={num.customer.email} />
              </div>
            </div>
          )}

          {/* Wallet */}
          {num.wallet && (
            <div style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
              <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-purple)", marginBottom: "14px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Number Wallet
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <Field label="Balance" value={<span style={{ color: "var(--emerald)", fontWeight: 700, fontSize: "15px" }}>৳{Number(num.wallet.balance).toFixed(2)}</span>} />
                <Field label="Currency" value={num.wallet.currency} />
                <Field label="Wallet Status" value={<StatusBadge status={num.wallet.status} />} />
              </div>
            </div>
          )}
        </div>

        {/* Right: status history */}
        <div>
          <div style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "20px", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
            <h3 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-purple)", marginBottom: "14px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Status History
            </h3>
            {history.length === 0 ? (
              <p style={{ color: "var(--text-dim)", fontSize: "12px" }}>No history recorded</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {history.map((h) => {
                  const tc = STATUS_COLORS[h.toStatus] ?? { bg: "transparent", color: "var(--text-main)", border: "var(--border-subtle)" };
                  return (
                    <div
                      key={h.id}
                      style={{
                        padding: "10px 12px",
                        background: "var(--bg-beige-subtle)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-subtle)",
                        borderLeft: `3px solid ${tc.color}`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                          {h.fromStatus && <span style={{ color: "var(--text-dim)" }}>{h.fromStatus}</span>}
                          {h.fromStatus && <span style={{ color: "var(--text-dim)" }}>→</span>}
                          <span style={{ color: tc.color, fontWeight: 700 }}>{h.toStatus}</span>
                        </div>
                        <span style={{ fontSize: "10px", color: "var(--text-dim)" }}>{new Date(h.createdAt).toLocaleDateString()}</span>
                      </div>
                      {h.reason && <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>{h.reason}</div>}
                      <div style={{ fontSize: "10px", color: "var(--text-dim)", marginTop: "2px" }}>
                        {h.source} · {h.changedBy}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
