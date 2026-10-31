"use client";

import { useEffect, useState, useCallback } from "react";
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
    <span style={{
      padding: "3px 9px", borderRadius: "999px", fontSize: "11px", fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "14px",
        width: "min(560px, 95vw)", maxHeight: "90vh", overflowY: "auto",
        padding: "28px", boxShadow: "var(--shadow-modal)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-purple)" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: "20px" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)",
  borderRadius: "8px", color: "var(--text-main)", padding: "9px 12px", fontSize: "13px", outline: "none",
  boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
};
const labelStyle: React.CSSProperties = { fontSize: "12px", color: "var(--text-dim)", marginBottom: "5px", display: "block", fontWeight: 600 };
const btnPrimary: React.CSSProperties = {
  background: "var(--sky-indigo)", color: "#fff", border: "none", borderRadius: "8px",
  padding: "9px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
  boxShadow: "0 2px 8px rgba(2, 132, 199, 0.25)",
};
const btnSecondary: React.CSSProperties = {
  background: "#ffffff", color: "var(--text-main)", border: "1px solid var(--border-subtle)",
  borderRadius: "8px", padding: "9px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
};
const btnDanger: React.CSSProperties = {
  background: "var(--rose-light)", color: "var(--rose)", border: "1px solid var(--rose-border)",
  borderRadius: "8px", padding: "9px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
};

interface NumberRow {
  id: string; number: string; normalizedNumber: string;
  status: string; numberType: string; city?: string; area?: string;
  callRate?: string; costPrice?: string; salePrice?: string;
  providerId?: string; displayCompanyId?: string;
  provider?: { id: string; code: string; name: string };
  displayCompany?: { id: string; code: string; name: string };
  customer?: { id: string; fullName: string; email: string };
  notes?: string; createdAt: string;
}

function detectIptspPrefix(phone: string) {
  const clean = (phone || "").replace(/\D/g, "");
  const m = clean.match(/^(?:880)?(096\d{2})/);
  const prefix = m ? m[1] : "";
  let providerCode = "";
  if (prefix === "09644") {
    providerCode = "ICON";
  } else if (prefix === "09617") {
    providerCode = "RANKSITT";
  } else if (prefix === "09639") {
    providerCode = "ICC";
  }
  return { prefix, providerCode };
}

export default function NumbersPage() {
  const [numbers, setNumbers] = useState<NumberRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [providers, setProviders] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editNumber, setEditNumber] = useState<NumberRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NumberRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [viewNumber, setViewNumber] = useState<NumberRow | null>(null);

  // Add form
  const [form, setForm] = useState({ number: "", numberType: "MOBILE", city: "", area: "",
    costPrice: "", salePrice: "", callRate: "", providerId: "", displayCompanyId: "", notes: "" });
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Import
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importConfirmFields, setImportConfirmFields] = useState({ providerId: "", displayCompanyId: "", numberType: "MOBILE", costPrice: "", salePrice: "" });
  const [importLoading, setImportLoading] = useState(false);

  const fetchNumbers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/numbers?${params}`);
      const data = await res.json();
      setNumbers(data.rows ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, query]);

  useEffect(() => { fetchNumbers(); }, [fetchNumbers]);

  useEffect(() => {
    fetch("/api/admin/providers").then(r => r.json()).then(setProviders);
    fetch("/api/admin/display-companies").then(r => r.json()).then(setCompanies);
  }, []);

  // Add number
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.number.trim()) { setFormError("Number is required"); return; }
    setFormLoading(true);
    try {
      const res = await fetch("/api/admin/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          number: form.number, numberType: form.numberType,
          city: form.city || undefined, area: form.area || undefined,
          costPrice: form.costPrice || undefined, salePrice: form.salePrice || undefined,
          callRate: form.callRate || undefined,
          providerId: form.providerId || undefined, displayCompanyId: form.displayCompanyId || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
      setShowAdd(false);
      setForm({ number: "", numberType: "MOBILE", city: "", area: "", costPrice: "", salePrice: "", callRate: "", providerId: "", displayCompanyId: "", notes: "" });
      fetchNumbers();
    } finally {
      setFormLoading(false);
    }
  }

  // Edit number
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editNumber) return;
    setFormError("");
    setFormLoading(true);
    try {
      const res = await fetch(`/api/admin/numbers/${editNumber.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: form.number ? undefined : editNumber.status,
          city: form.city || undefined, area: form.area || undefined,
          costPrice: form.costPrice || undefined, salePrice: form.salePrice || undefined,
          callRate: form.callRate || undefined,
          providerId: form.providerId || undefined, displayCompanyId: form.displayCompanyId || undefined,
          notes: form.notes || undefined,
          reason: "Admin update",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? "Failed"); return; }
      setEditNumber(null);
      fetchNumbers();
    } finally {
      setFormLoading(false);
    }
  }

  // Status change directly from table
  async function handleStatusChange(num: NumberRow, newStatus: string) {
    const res = await fetch(`/api/admin/numbers/${num.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, reason: "Admin manual status change" }),
    });
    if (res.ok) fetchNumbers();
  }

  // Delete
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/admin/numbers/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDeleteTarget(null);
        fetchNumbers();
      } else {
        setDeleteError(data.error || "Failed to delete number");
      }
    } catch (e: any) {
      setDeleteError(e?.message || "Failed to delete number");
    } finally {
      setDeleteLoading(false);
    }
  }

  // Import parse
  async function handleImportPreview() {
    const lines = importText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setImportLoading(true);
    try {
      const res = await fetch("/api/admin/numbers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: lines, filename: "paste_import.csv" }),
      });
      const data = await res.json();
      setImportPreview(data);
    } finally {
      setImportLoading(false);
    }
  }

  // Import confirm
  async function handleImportConfirm() {
    if (!importPreview?.importId) return;
    setImportLoading(true);
    try {
      const res = await fetch("/api/admin/numbers/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: importPreview.importId, ...importConfirmFields }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowImport(false);
        setImportText("");
        setImportPreview(null);
        fetchNumbers();
        alert(`Imported ${data.imported} numbers successfully.`);
      }
    } finally {
      setImportLoading(false);
    }
  }

  const statusOptions = ["ALL", "AVAILABLE", "RESERVED", "PROCESSING", "ACTIVE", "SUSPENDED", "BLOCKED", "RELEASED", "FAILED"];

  return (
    <AdminLayout title="Number Inventory" subtitle="Manage available numbers, status and assignments">
      {/* Stats strip */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        {statusOptions.filter(s => s !== "ALL").map(s => {
          const c = STATUS_COLORS[s] ?? { bg: "var(--bg-beige)", color: "var(--text-dim)", border: "var(--border-subtle)" };
          const isSel = statusFilter === s;
          return (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? "ALL" : s)}
              style={{
                background: isSel ? "var(--sky-blue-light)" : "#ffffff",
                border: `1px solid ${isSel ? "var(--sky-blue)" : "var(--border-subtle)"}`,
                borderRadius: "8px", padding: "8px 14px", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: "2px",
                boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
                minWidth: "85px",
              }}>
              <span style={{ fontSize: "18px", fontWeight: 700, color: isSel ? "var(--primary)" : "var(--text-main)" }}>
                {total > 0 && statusFilter === s ? total : "—"}
              </span>
              <span style={{ fontSize: "10px", color: isSel ? "var(--primary)" : c.color, fontWeight: 700, letterSpacing: "0.05em" }}>{s}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}
          placeholder="Search number, city…"
          style={{ ...inputStyle, width: "240px", flex: "none" }}
        />
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: "160px", flex: "none" }}>
          {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button onClick={() => setShowImport(true)} style={btnSecondary}>Bulk Import</button>
          <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Add Number</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-beige-subtle)" }}>
                {["Number", "Type", "Status", "Provider Code", "Display Code", "Sale Price", "Customer", "Created", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: "var(--text-dim)", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>Loading…</td></tr>
              ) : numbers.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "40px", color: "var(--text-dim)" }}>No numbers found</td></tr>
              ) : numbers.map((num, i) => (
                <tr key={num.id} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "#ffffff" : "var(--bg-card-hover)" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <Link href={`/admin/numbers/${num.id}`} style={{ fontFamily: "monospace", color: "var(--primary)", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "var(--primary-hover)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--primary)")}>
                      {num.number}
                    </Link>
                  </td>
                  <td style={{ padding: "12px 14px", color: "var(--text-muted)", fontWeight: 500 }}>{num.numberType}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <select value={num.status}
                      onChange={e => handleStatusChange(num, e.target.value)}
                      style={{ background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "3px 8px", outline: "none", cursor: "pointer", fontSize: "11px", fontWeight: 600, color: "var(--text-main)" }}>
                      <option value={num.status}>{num.status}</option>
                      {["AVAILABLE","RESERVED","PROCESSING","ACTIVE","SUSPENDED","BLOCKED","RELEASED","FAILED"]
                        .filter(s => s !== num.status)
                        .map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <StatusBadge status={num.status} />
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", fontFamily: "monospace" }}>{num.provider?.code ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", fontFamily: "monospace" }}>
                    {num.displayCompany?.code || (num.number.startsWith("09644") ? "09644" : num.number.startsWith("09617") ? "09617" : num.number.startsWith("09639") ? "09639" : "—")}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)" }}>{num.salePrice ? `৳${Number(num.salePrice).toFixed(2)}` : "—"}</td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", fontSize: "12px" }}>{num.customer?.fullName ?? "—"}</td>
                  <td style={{ padding: "10px 14px", color: "var(--text-dim)", fontSize: "11px" }}>{new Date(num.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => {
                        const detected = detectIptspPrefix(num.number);
                        const matchedCompany = detected.prefix ? companies.find((c: any) => c.code === detected.prefix) : null;
                        const matchedProvider = detected.providerCode ? providers.find((p: any) => p.code === detected.providerCode) : null;

                        setEditNumber(num);
                        setForm({
                          number: num.number,
                          numberType: num.numberType,
                          city: num.city ?? "",
                          area: num.area ?? "",
                          costPrice: num.costPrice ?? "",
                          salePrice: num.salePrice ?? "",
                          callRate: num.callRate ?? "",
                          providerId: num.providerId || matchedProvider?.id || "",
                          displayCompanyId: num.displayCompanyId || matchedCompany?.id || "",
                          notes: num.notes ?? ""
                        });
                        setFormError("");
                      }}
                        style={{ ...btnSecondary, padding: "4px 10px", fontSize: "11px" }}>Edit</button>
                      <button onClick={() => setDeleteTarget(num)}
                        style={{ ...btnDanger, padding: "4px 10px", fontSize: "11px" }}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: "flex", gap: "8px", padding: "12px 16px", alignItems: "center", borderTop: "1px solid var(--border-subtle)", background: "var(--bg-beige-subtle)" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>Total: {total}</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ ...btnSecondary, padding: "4px 12px" }}>←</button>
              <span style={{ color: "var(--text-main)", fontSize: "13px", padding: "4px 8px", fontWeight: 600 }}>{page} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} style={{ ...btnSecondary, padding: "4px 12px" }}>→</button>
            </div>
          </div>
        )}
      </div>

      {/* Add Number Modal */}
      {showAdd && (
        <Modal title="Add Number" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={labelStyle}>Phone Number *</label>
              <input
                style={inputStyle}
                value={form.number}
                onChange={e => {
                  const val = e.target.value;
                  const detected = detectIptspPrefix(val);
                  const matchedCompany = detected.prefix ? companies.find((c: any) => c.code === detected.prefix) : null;
                  const matchedProvider = detected.providerCode ? providers.find((p: any) => p.code === detected.providerCode || (detected.providerCode === "RANKSITT" && p.code === "RANKS")) : null;

                  setForm(f => ({
                    ...f,
                    number: val,
                    displayCompanyId: matchedCompany ? matchedCompany.id : f.displayCompanyId,
                    providerId: matchedProvider ? matchedProvider.id : f.providerId,
                  }));
                }}
                placeholder="09644XXXXXX, 09617XXXXXX, 09639XXXXXX"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select style={inputStyle} value={form.numberType} onChange={e => setForm(f => ({ ...f, numberType: e.target.value }))}>
                  <option>MOBILE</option><option>LANDLINE</option><option>TOLL_FREE</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Dhaka" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Cost Price (BDT)</label>
                <input style={inputStyle} type="number" step="0.01" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Sale Price (BDT)</label>
                <input style={inputStyle} type="number" step="0.01" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Provider (internal)</label>
                <select style={inputStyle} value={form.providerId} onChange={e => setForm(f => ({ ...f, providerId: e.target.value }))}>
                  <option value="">— None —</option>
                  {providers.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Display Code (customer-facing)</label>
                <select style={inputStyle} value={form.displayCompanyId} onChange={e => setForm(f => ({ ...f, displayCompanyId: e.target.value }))}>
                  <option value="">— None —</option>
                  {companies
                    .filter((c: any) => c.isActive !== false && ["09617", "09639", "09644"].includes(c.code))
                    .map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {formError && <p style={{ color: "var(--rose)", fontSize: "12px" }}>{formError}</p>}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowAdd(false)} style={btnSecondary}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={formLoading}>{formLoading ? "Adding…" : "Add Number"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editNumber && (
        <Modal title={`Edit: ${editNumber.number}`} onClose={() => setEditNumber(null)}>
          <form onSubmit={handleEdit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Area</label>
                <input style={inputStyle} value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Cost Price</label>
                <input style={inputStyle} type="number" step="0.01" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Sale Price</label>
                <input style={inputStyle} type="number" step="0.01" value={form.salePrice} onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Provider</label>
                <select style={inputStyle} value={form.providerId} onChange={e => setForm(f => ({ ...f, providerId: e.target.value }))}>
                  <option value="">— None —</option>
                  {providers.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Display Code</label>
                <select style={inputStyle} value={form.displayCompanyId} onChange={e => setForm(f => ({ ...f, displayCompanyId: e.target.value }))}>
                  <option value="">— None —</option>
                  {companies
                    .filter((c: any) => c.isActive !== false && ["09617", "09639", "09644"].includes(c.code))
                    .map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            {formError && <p style={{ color: "var(--rose)", fontSize: "12px" }}>{formError}</p>}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setEditNumber(null)} style={btnSecondary}>Cancel</button>
              <button type="submit" style={btnPrimary} disabled={formLoading}>{formLoading ? "Saving…" : "Save Changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal title="Confirm Delete" onClose={() => { setDeleteTarget(null); setDeleteError(""); }}>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "16px" }}>
            Are you sure you want to delete <strong style={{ color: "var(--text-main)" }}>{deleteTarget.number}</strong> ({deleteTarget.status})? This is irreversible and will permanently remove this number and all associated records.
          </p>
          {deleteError && (
            <p style={{ color: "var(--rose)", fontSize: "12px", marginBottom: "16px", background: "var(--rose-light)", border: "1px solid var(--rose-border)", padding: "8px 12px", borderRadius: "6px" }}>
              {deleteError}
            </p>
          )}
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button onClick={() => { setDeleteTarget(null); setDeleteError(""); }} style={btnSecondary} disabled={deleteLoading}>Cancel</button>
            <button onClick={handleDelete} style={btnDanger} disabled={deleteLoading}>
              {deleteLoading ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}

      {/* Bulk Import Modal */}
      {showImport && (
        <Modal title="Bulk Import Numbers" onClose={() => { setShowImport(false); setImportPreview(null); setImportText(""); }}>
          {!importPreview ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>Paste one number per line. Supports 01XXXXXXXXX or 880XXXXXXXXXX format.</p>
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={"01712345678\n01898765432\n880171..."}
                style={{ ...inputStyle, height: "200px", resize: "vertical", fontFamily: "monospace", fontSize: "12px" }}
              />
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button onClick={() => setShowImport(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleImportPreview} style={btnPrimary} disabled={importLoading || !importText.trim()}>
                  {importLoading ? "Validating…" : "Validate & Preview"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {[
                  { label: "Total", val: importPreview.totalRows, color: "var(--text-main)" },
                  { label: "Valid", val: importPreview.validRows, color: "var(--emerald)" },
                  { label: "Duplicate", val: importPreview.duplicateRows, color: "var(--amber)" },
                  { label: "Invalid", val: importPreview.invalidRows, color: "var(--rose)" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: "center", background: "var(--bg-beige-subtle)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "10px 16px", flex: 1 }}>
                    <div style={{ fontSize: "22px", fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: 600 }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Provider (optional)</label>
                  <select style={inputStyle} value={importConfirmFields.providerId} onChange={e => setImportConfirmFields(f => ({ ...f, providerId: e.target.value }))}>
                    <option value="">— None —</option>
                    {providers.map((p: any) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Display Code (optional)</label>
                  <select style={inputStyle} value={importConfirmFields.displayCompanyId} onChange={e => setImportConfirmFields(f => ({ ...f, displayCompanyId: e.target.value }))}>
                    <option value="">— None —</option>
                    {companies
                      .filter((c: any) => c.isActive !== false && ["09617", "09639", "09644"].includes(c.code))
                      .map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Sale Price (BDT)</label>
                  <input style={inputStyle} type="number" step="0.01" value={importConfirmFields.salePrice} onChange={e => setImportConfirmFields(f => ({ ...f, salePrice: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Cost Price (BDT)</label>
                  <input style={inputStyle} type="number" step="0.01" value={importConfirmFields.costPrice} onChange={e => setImportConfirmFields(f => ({ ...f, costPrice: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button onClick={() => setImportPreview(null)} style={btnSecondary}>← Back</button>
                <button onClick={handleImportConfirm} style={btnPrimary} disabled={importLoading || importPreview.validRows === 0}>
                  {importLoading ? "Importing…" : `Import ${importPreview.validRows} Valid Numbers`}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </AdminLayout>
  );
}
