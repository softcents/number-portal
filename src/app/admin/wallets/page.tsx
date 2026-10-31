"use client";

import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/AdminLayout";

interface Wallet {
  id: string; balance: string; currency: string; status: string; createdAt: string;
  number?: { id: string; number: string; status: string; displayCompany?: { code: string } };
  customer?: { id: string; fullName: string; email: string };
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  ACTIVE:    { bg: "var(--emerald-light)", color: "var(--emerald)", border: "var(--emerald-border)" },
  PENDING:   { bg: "var(--amber-light)", color: "var(--amber)", border: "var(--amber-border)" },
  SUSPENDED: { bg: "var(--rose-light)", color: "var(--rose)", border: "var(--rose-border)" },
  LOCKED:    { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" },
  CLOSED:    { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" },
};

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    const res = await fetch(`/api/admin/wallets?${params}`);
    const data = await res.json();
    setWallets(data.rows ?? []);
    setTotal(data.total ?? 0);
    setPages(data.pages ?? 1);
    const tb = (data.rows ?? []).reduce((s: number, w: Wallet) => s + Number(w.balance), 0);
    setTotalBalance(tb);
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const btnSecondary: React.CSSProperties = {
    background: "#ffffff",
    color: "var(--text-main)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "8px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
  };

  return (
    <AdminLayout title="Number Wallets" subtitle="Balance management for all active numbers">
      {/* Summary strip */}
      <div style={{ display: "flex", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          { label: "Total Wallets", val: total, color: "var(--primary)" },
          { label: "Total Balance", val: `৳${totalBalance.toFixed(2)}`, color: "var(--emerald)" },
        ].map(({ label, val, color }) => (
          <div
            key={label}
            style={{
              background: "#ffffff",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              padding: "14px 20px",
              minWidth: "160px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
            }}
          >
            <div style={{ fontSize: "22px", fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)", marginTop: "3px", fontWeight: 500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {["ALL", "ACTIVE", "PENDING", "SUSPENDED", "LOCKED", "CLOSED"].map(s => {
          const isSel = statusFilter === s;
          const c = STATUS_COLORS[s] ?? { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" };
          return (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "5px 14px",
                borderRadius: "999px",
                cursor: "pointer",
                transition: "all 0.15s ease",
                background: isSel ? "var(--sky-indigo)" : "#ffffff",
                color: isSel ? "#ffffff" : "var(--text-main)",
                border: isSel ? "1px solid transparent" : "1px solid var(--border-subtle)",
                boxShadow: isSel ? "0 2px 8px rgba(2, 132, 199, 0.25)" : "0 1px 2px rgba(15,23,42,0.03)",
              }}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-beige-subtle)" }}>
              {["Number", "Display", "Customer", "Balance", "Currency", "Status", "Created"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "var(--text-dim)", fontWeight: 700, fontSize: "11px", letterSpacing: "0.04em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>Loading…</td></tr>
            ) : wallets.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "60px", color: "var(--text-dim)" }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-main)" }}>No wallets found</div>
                  <div style={{ fontSize: "12px", marginTop: "6px", color: "var(--text-muted)" }}>Wallets are created when numbers become ACTIVE</div>
                </td>
              </tr>
            ) : wallets.map((w, i) => {
              const c = STATUS_COLORS[w.status] ?? { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" };
              return (
                <tr key={w.id} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "#ffffff" : "var(--bg-card-hover)" }}>
                  <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "var(--text-main)", fontWeight: 600 }}>{w.number?.number ?? "—"}</td>
                  <td style={{ padding: "12px 16px", color: "var(--primary)", fontFamily: "monospace", fontWeight: 600 }}>{w.number?.displayCompany?.code ?? "—"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ color: "var(--text-heading)", fontSize: "13px", fontWeight: 600 }}>{w.customer?.fullName ?? "—"}</div>
                    <div style={{ color: "var(--text-dim)", fontSize: "11px" }}>{w.customer?.email}</div>
                  </td>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: Number(w.balance) > 0 ? "var(--emerald)" : "var(--text-dim)" }}>
                    ৳{Number(w.balance).toFixed(2)}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-muted)", fontSize: "12px", fontWeight: 500 }}>{w.currency}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{w.status}</span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--text-dim)", fontSize: "12px" }}>{new Date(w.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {pages > 1 && (
          <div style={{ display: "flex", gap: "8px", padding: "12px 16px", justifyContent: "flex-end", alignItems: "center", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-beige-subtle)" }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>← Previous</button>
            <span style={{ color: "var(--text-main)", fontSize: "12px", fontWeight: 600, padding: "0 8px" }}>Page {page} of {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={btnSecondary}>Next →</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
