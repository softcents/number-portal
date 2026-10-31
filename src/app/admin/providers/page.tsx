"use client";

import { useEffect, useState } from "react";
import AdminLayout from "@/components/AdminLayout";

interface Provider {
  id: string;
  code: string;
  name: string;
  loginUrl?: string;
  rechargeLoginUrl?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  credential?: {
    id: string;
    username: string;
    password?: string;
    rechargeUsername?: string;
    rechargePassword?: string;
  } | null;
  _count?: { numbers: number };
}

// Icons
function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--border-subtle)",
          borderRadius: "16px",
          width: "min(560px, 95vw)",
          padding: "26px",
          boxShadow: "var(--shadow-modal)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-heading)" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-dim)",
              cursor: "pointer",
              fontSize: "20px",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Provider | null>(null);

  // Per-card form state
  const [kycForms, setKycForms] = useState<Record<string, { loginUrl: string; username: string; password: string }>>({});
  const [rechargeForms, setRechargeForms] = useState<Record<string, { loginUrl: string; username: string; password: string }>>({});

  // Password reveal toggles
  const [showKycPassword, setShowKycPassword] = useState<Record<string, boolean>>({});
  const [showRechargePassword, setShowRechargePassword] = useState<Record<string, boolean>>({});

  // Save state & feedback badges
  const [savingKyc, setSavingKyc] = useState<Record<string, boolean>>({});
  const [savingRecharge, setSavingRecharge] = useState<Record<string, boolean>>({});
  const [savedKycNotice, setSavedKycNotice] = useState<Record<string, string>>({});
  const [savedRechargeNotice, setSavedRechargeNotice] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Live Test states
  const [testingKyc, setTestingKyc] = useState<Record<string, boolean>>({});
  const [testingRecharge, setTestingRecharge] = useState<Record<string, boolean>>({});
  const [testKycResult, setTestKycResult] = useState<Record<string, { ok: boolean; msg: string } | null>>({});
  const [testRechargeResult, setTestRechargeResult] = useState<Record<string, { ok: boolean; msg: string } | null>>({});

  // New provider modal form
  const [addForm, setAddForm] = useState({
    code: "",
    name: "",
    loginUrl: "",
    username: "",
    password: "",
    rechargeLoginUrl: "",
    rechargeUsername: "",
    rechargePassword: "",
    notes: "",
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/providers");
      const data = await res.json();
      const list: Provider[] = Array.isArray(data) ? data : [];
      setProviders(list);

      // Populate form state from loaded providers
      const newKycForms: Record<string, { loginUrl: string; username: string; password: string }> = {};
      const newRechargeForms: Record<string, { loginUrl: string; username: string; password: string }> = {};

      list.forEach((p) => {
        newKycForms[p.id] = {
          loginUrl: p.loginUrl || "",
          username: p.credential?.username || "",
          password: p.credential?.password || "",
        };
        newRechargeForms[p.id] = {
          loginUrl: p.rechargeLoginUrl || "",
          username: p.credential?.rechargeUsername || "",
          password: p.credential?.rechargePassword || "",
        };
      });

      setKycForms(newKycForms);
      setRechargeForms(newRechargeForms);
    } catch (err) {
      console.error("Failed to load providers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const testKycCredentials = async (provider: Provider) => {
    const pForm = kycForms[provider.id] || { loginUrl: "", username: "", password: "" };
    setTestingKyc((prev) => ({ ...prev, [provider.id]: true }));
    setTestKycResult((prev) => ({ ...prev, [provider.id]: null }));

    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "kyc",
          loginUrl: pForm.loginUrl,
          username: pForm.username,
          password: pForm.password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTestKycResult((prev) => ({
          ...prev,
          [provider.id]: { ok: true, msg: data.message || "Login Verified" },
        }));
      } else {
        setTestKycResult((prev) => ({
          ...prev,
          [provider.id]: { ok: false, msg: data.error || data.message || "Login Failed" },
        }));
      }
    } catch (err: any) {
      setTestKycResult((prev) => ({
        ...prev,
        [provider.id]: { ok: false, msg: "Network error: " + err?.message },
      }));
    } finally {
      setTestingKyc((prev) => ({ ...prev, [provider.id]: false }));
    }
  };

  const testRechargeCredentials = async (provider: Provider) => {
    const rForm = rechargeForms[provider.id] || { loginUrl: "", username: "", password: "" };
    setTestingRecharge((prev) => ({ ...prev, [provider.id]: true }));
    setTestRechargeResult((prev) => ({ ...prev, [provider.id]: null }));

    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "recharge",
          loginUrl: rForm.loginUrl,
          username: rForm.username,
          password: rForm.password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTestRechargeResult((prev) => ({
          ...prev,
          [provider.id]: { ok: true, msg: data.message || "SSO Login Verified" },
        }));
      } else {
        setTestRechargeResult((prev) => ({
          ...prev,
          [provider.id]: { ok: false, msg: data.error || data.message || "SSO Login Failed" },
        }));
      }
    } catch (err: any) {
      setTestRechargeResult((prev) => ({
        ...prev,
        [provider.id]: { ok: false, msg: "Network error: " + err?.message },
      }));
    } finally {
      setTestingRecharge((prev) => ({ ...prev, [provider.id]: false }));
    }
  };

  const saveKycCredentials = async (provider: Provider) => {
    const pForm = kycForms[provider.id] || { loginUrl: "", username: "", password: "" };
    setSavingKyc((prev) => ({ ...prev, [provider.id]: true }));
    setSavedKycNotice((prev) => ({ ...prev, [provider.id]: "" }));

    try {
      const res = await fetch(`/api/admin/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginUrl: pForm.loginUrl,
          username: pForm.username,
          password: pForm.password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to update KYC credentials");
        return;
      }

      if (data && data.id) {
        setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, ...data } : p)));
      }

      setSavedKycNotice((prev) => ({ ...prev, [provider.id]: "✓ Updated & Synced to automation" }));
      setTimeout(() => {
        setSavedKycNotice((prev) => ({ ...prev, [provider.id]: "" }));
      }, 4000);
    } catch (err: any) {
      alert("Error saving KYC credentials: " + err?.message);
    } finally {
      setSavingKyc((prev) => ({ ...prev, [provider.id]: false }));
    }
  };

  const saveRechargeCredentials = async (provider: Provider) => {
    const rForm = rechargeForms[provider.id] || { loginUrl: "", username: "", password: "" };
    setSavingRecharge((prev) => ({ ...prev, [provider.id]: true }));
    setSavedRechargeNotice((prev) => ({ ...prev, [provider.id]: "" }));

    try {
      const res = await fetch(`/api/admin/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rechargeLoginUrl: rForm.loginUrl,
          rechargeUsername: rForm.username,
          rechargePassword: rForm.password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to update Recharge credentials");
        return;
      }

      if (data && data.id) {
        setProviders((prev) => prev.map((p) => (p.id === provider.id ? { ...p, ...data } : p)));
      }

      setSavedRechargeNotice((prev) => ({ ...prev, [provider.id]: "✓ Updated & Synced to automation" }));
      setTimeout(() => {
        setSavedRechargeNotice((prev) => ({ ...prev, [provider.id]: "" }));
      }, 4000);
    } catch (err: any) {
      alert("Error saving Recharge credentials: " + err?.message);
    } finally {
      setSavingRecharge((prev) => ({ ...prev, [provider.id]: false }));
    }
  };

  const handleToggle = async (p: Provider) => {
    await fetch(`/api/admin/providers/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    load();
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.code || !addForm.name) {
      setAddError("Provider Code and Name are required");
      return;
    }
    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error || "Failed to create provider");
        return;
      }
      setShowAdd(false);
      setAddForm({
        code: "",
        name: "",
        loginUrl: "",
        username: "",
        password: "",
        rechargeLoginUrl: "",
        rechargeUsername: "",
        rechargePassword: "",
        notes: "",
      });
      load();
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/providers/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Failed to delete provider");
      return;
    }
    setDeleteTarget(null);
    load();
  };

  // Group or order providers so ICC, ICON, and RANKSITT are upfront
  const sortedProviders = [...providers].sort((a, b) => {
    if (a.code === "ICC") return -1;
    if (b.code === "ICC") return 1;
    if (a.code === "ICON") return -1;
    if (b.code === "ICON") return 1;
    if (a.code === "RANKSITT" || a.code === "RANKS") return -1;
    if (b.code === "RANKSITT" || b.code === "RANKS") return 1;
    return a.code.localeCompare(b.code);
  });

  return (
    <AdminLayout
      title="Provider Automation Credentials"
      subtitle="Full administrative control over ICC, ICON & Ranksitt login credentials for KYC Registration and Top-Up Recharge automations"
    >
      {/* Top Banner / System Controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          marginBottom: "24px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          padding: "16px 20px",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "7px",
              background: "var(--emerald-light)",
              border: "1px solid var(--emerald-border)",
              borderRadius: "999px",
              padding: "4px 12px",
              fontSize: "12px",
              color: "#065f46",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#059669",
                boxShadow: "0 0 6px rgba(5, 150, 105, 0.5)",
              }}
            />
            Live Automation Sync Active
          </div>

          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Edits made here immediately override default credentials for both registration &amp; recharge automations.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={load}
            style={{
              background: "var(--bg-beige)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              color: "var(--text-muted)",
              padding: "8px 14px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => setShowAdd(true)}
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
            }}
          >
            + Add Provider
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-dim)" }}>
          <div style={{ display: "inline-block", width: "32px", height: "32px", border: "3px solid rgba(59,130,246,0.2)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <p style={{ marginTop: "14px", fontSize: "14px" }}>Loading credentials and automation profiles…</p>
        </div>
      ) : sortedProviders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
          <p>No providers configured yet.</p>
          <button onClick={() => setShowAdd(true)} style={{ marginTop: "12px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", fontSize: "13px", cursor: "pointer" }}>
            Add Provider
          </button>
        </div>
      ) : (
        /* The Two-Grid Layout: Left Grid = KYC Credentials, Right Grid = Recharge Credentials */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
            gap: "24px",
            alignItems: "start",
          }}
        >
          {/* ========================================================================= */}
          {/* SIDE 1: KYC CREDENTIALS (PROVIDER REGISTRATION FORM FILLUP AUTOMATION)    */}
          {/* ========================================================================= */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              padding: "22px",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
              position: "relative",
            }}
          >
            {/* Header Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", borderBottom: "1px solid rgba(148,163,184,0.12)", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "var(--sky-light)",
                    border: "1px solid var(--sky-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ShieldIcon />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-purple)", margin: 0 }}>KYC Credentials</h2>
                    <span style={{ fontSize: "10px", fontWeight: 700, background: "var(--sky-blue-light)", color: "var(--sky-blue)", padding: "2px 8px", borderRadius: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Form Automation
                    </span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "2px 0 0 0" }}>
                    Portal logins for automated subscriber registration &amp; verification form fillup
                  </p>
                </div>
              </div>
            </div>

            {/* Provider Cards within KYC Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {sortedProviders.map((p) => {
                const kyc = kycForms[p.id] || { loginUrl: "", username: "", password: "" };
                const isPassVisible = Boolean(showKycPassword[p.id]);
                const isSaving = Boolean(savingKyc[p.id]);
                const notice = savedKycNotice[p.id];
                const copyPrefix = `kyc_${p.id}`;

                return (
                  <div
                    key={`kyc_${p.id}`}
                    style={{
                      background: "var(--bg-beige-subtle)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "12px",
                      padding: "18px",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {/* Card Title & Provider Tag */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "14px",
                            fontWeight: 700,
                            color: p.code === "ICC" ? "var(--sky-blue)" : "var(--indigo)",
                            background: p.code === "ICC" ? "var(--sky-blue-light)" : "rgba(139,92,246,0.15)",
                            border: `1px solid ${p.code === "ICC" ? "rgba(59,130,246,0.3)" : "rgba(139,92,246,0.3)"}`,
                            padding: "3px 10px",
                            borderRadius: "6px",
                          }}
                        >
                          {p.code}
                        </span>
                        <div>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
                            {p.code === "ICC" ? "ICC KYC Portal (Admin Panel)" : p.code === "ICON" ? "ICON KYC Portal" : p.name}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-dim)", display: "block" }}>
                            {p._count?.numbers ?? 0} numbers assigned
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleToggle(p)}
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: "999px",
                            border: "none",
                            cursor: "pointer",
                            background: p.isActive ? "var(--emerald-light)" : "var(--rose-light)",
                            color: p.isActive ? "var(--emerald)" : "var(--rose)",
                          }}
                        >
                          {p.isActive ? "● ACTIVE" : "○ INACTIVE"}
                        </button>
                      </div>
                    </div>

                    {/* Inputs */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {/* Login URL */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)" }}>KYC Portal Login Link (URL)</label>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {kyc.loginUrl && (
                              <a
                                href={kyc.loginUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: "11px", color: "var(--sky-blue)", display: "flex", alignItems: "center", gap: "3px", textDecoration: "none" }}
                              >
                                Test Link <ExternalLinkIcon />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => copyToClipboard(kyc.loginUrl, `${copyPrefix}_url`)}
                              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0 2px" }}
                              title="Copy URL"
                            >
                              {copiedKey === `${copyPrefix}_url` ? <CheckIcon /> : <CopyIcon />}
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={kyc.loginUrl}
                          onChange={(e) =>
                            setKycForms((prev) => ({
                              ...prev,
                              [p.id]: { ...kyc, loginUrl: e.target.value },
                            }))
                          }
                          placeholder="https://..."
                          style={{
                            width: "100%",
                            background: "#ffffff",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "8px",
                            color: "var(--text-main)",
                            boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
                            padding: "8px 12px",
                            fontSize: "12px",
                            outline: "none",
                            fontFamily: "monospace",
                          }}
                        />
                      </div>

                      {/* Username & Password Grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        {/* Username */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)" }}>Username</label>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(kyc.username, `${copyPrefix}_user`)}
                              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0 2px" }}
                              title="Copy Username"
                            >
                              {copiedKey === `${copyPrefix}_user` ? <CheckIcon /> : <CopyIcon />}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={kyc.username}
                            onChange={(e) =>
                              setKycForms((prev) => ({
                                ...prev,
                                [p.id]: { ...kyc, username: e.target.value },
                              }))
                            }
                            placeholder="Username"
                            autoComplete="off"
                            style={{
                              width: "100%",
                              background: "#ffffff",
                              border: "1px solid rgba(148,163,184,0.18)",
                              borderRadius: "8px",
                              color: "var(--text-main)",
                              padding: "8px 12px",
                              fontSize: "12px",
                              outline: "none",
                            }}
                          />
                        </div>

                        {/* Password */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)" }}>Password</label>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowKycPassword((prev) => ({
                                    ...prev,
                                    [p.id]: !prev[p.id],
                                  }))
                                }
                                style={{ background: "none", border: "none", color: isPassVisible ? "var(--sky-blue)" : "var(--text-dim)", cursor: "pointer", padding: "0 2px", display: "flex", alignItems: "center" }}
                                title={isPassVisible ? "Hide Password" : "Show Password"}
                              >
                                <EyeIcon visible={isPassVisible} />
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(kyc.password, `${copyPrefix}_pass`)}
                                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0 2px" }}
                                title="Copy Password"
                              >
                                {copiedKey === `${copyPrefix}_pass` ? <CheckIcon /> : <CopyIcon />}
                              </button>
                            </div>
                          </div>
                          <input
                            type={isPassVisible ? "text" : "password"}
                            value={kyc.password}
                            onChange={(e) =>
                              setKycForms((prev) => ({
                                ...prev,
                                [p.id]: { ...kyc, password: e.target.value },
                              }))
                            }
                            placeholder="Password"
                            autoComplete="new-password"
                            style={{
                              width: "100%",
                              background: "#ffffff",
                              border: "1px solid rgba(148,163,184,0.18)",
                              borderRadius: "8px",
                              color: "var(--text-main)",
                              padding: "8px 12px",
                              fontSize: "12px",
                              outline: "none",
                              fontFamily: isPassVisible ? "inherit" : "monospace",
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Save bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(148,163,184,0.08)", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ fontSize: "11px", maxWidth: "260px" }}>
                        {testKycResult[p.id] ? (
                          <span style={{ color: testKycResult[p.id]?.ok ? "var(--emerald)" : "var(--rose)", fontWeight: 600 }}>
                            {testKycResult[p.id]?.ok ? "✓ " : "✗ "}
                            {testKycResult[p.id]?.msg}
                          </span>
                        ) : (
                          <span style={{ color: notice ? "var(--emerald)" : "var(--text-dim)", fontWeight: notice ? 600 : 400 }}>
                            {notice || "Changes save to database & automation"}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => testKycCredentials(p)}
                          disabled={Boolean(testingKyc[p.id])}
                          style={{
                            background: "var(--sky-blue-light)",
                            border: "1px solid rgba(59,130,246,0.3)",
                            color: "var(--sky-blue)",
                            borderRadius: "6px",
                            padding: "6px 12px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: Boolean(testingKyc[p.id]) ? "not-allowed" : "pointer",
                          }}
                        >
                          {Boolean(testingKyc[p.id]) ? "Testing…" : "⚡ Test Login"}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveKycCredentials(p)}
                          disabled={isSaving}
                          style={{
                            background: isSaving ? "var(--text-dim)" : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 16px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: isSaving ? "not-allowed" : "pointer",
                            boxShadow: "0 2px 8px rgba(37,99,235,0.2)",
                          }}
                        >
                          {isSaving ? "Saving…" : "Save KYC"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SIDE 2: RECHARGE CREDENTIALS (TOP-UP RECHARGE AUTOMATION)                */}
          {/* ========================================================================= */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "16px",
              padding: "22px",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
              position: "relative",
            }}
          >
            {/* Header Badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px", borderBottom: "1px solid rgba(148,163,184,0.12)", paddingBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "var(--amber-light)",
                    border: "1px solid var(--amber-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ZapIcon />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-purple)", margin: 0 }}>Recharge Credentials</h2>
                    <span style={{ fontSize: "10px", fontWeight: 700, background: "rgba(245,158,11,0.15)", color: "var(--amber)", padding: "2px 8px", borderRadius: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Top-Up Automation
                    </span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "2px 0 0 0" }}>
                    Portal logins for automated balance recharge &amp; instant PIN top-up
                  </p>
                </div>
              </div>
            </div>

            {/* Provider Cards within Recharge Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {sortedProviders.map((p) => {
                const rech = rechargeForms[p.id] || { loginUrl: "", username: "", password: "" };
                const isPassVisible = Boolean(showRechargePassword[p.id]);
                const isSaving = Boolean(savingRecharge[p.id]);
                const notice = savedRechargeNotice[p.id];
                const copyPrefix = `rech_${p.id}`;

                return (
                  <div
                    key={`rech_${p.id}`}
                    style={{
                      background: "var(--bg-beige-subtle)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "12px",
                      padding: "18px",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {/* Card Title & Provider Tag */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "14px",
                            fontWeight: 700,
                            color: p.code === "ICC" ? "#b45309" : "#059669",
                            background: p.code === "ICC" ? "var(--amber-light)" : "var(--emerald-light)",
                            border: `1px solid ${p.code === "ICC" ? "var(--amber-border)" : "var(--emerald-border)"}`,
                            padding: "3px 10px",
                            borderRadius: "6px",
                          }}
                        >
                          {p.code}
                        </span>
                        <div>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-main)" }}>
                            {p.code === "ICC" ? "ICC Talk Billing Portal (Pin Recharge)" : p.code === "ICON" ? "ICON Recharge Portal" : `${p.name} Recharge`}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--text-dim)", display: "block" }}>
                            Automated top-up worker integration
                          </span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleToggle(p)}
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: "999px",
                            border: "none",
                            cursor: "pointer",
                            background: p.isActive ? "var(--emerald-light)" : "var(--rose-light)",
                            color: p.isActive ? "var(--emerald)" : "var(--rose)",
                          }}
                        >
                          {p.isActive ? "● ACTIVE" : "○ INACTIVE"}
                        </button>
                      </div>
                    </div>

                    {/* Inputs */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {/* Login URL */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)" }}>Recharge Portal Login Link (URL)</label>
                          <div style={{ display: "flex", gap: "8px" }}>
                            {rech.loginUrl && (
                              <a
                                href={rech.loginUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: "11px", color: "var(--amber)", display: "flex", alignItems: "center", gap: "3px", textDecoration: "none" }}
                              >
                                Test Link <ExternalLinkIcon />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rech.loginUrl, `${copyPrefix}_url`)}
                              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0 2px" }}
                              title="Copy URL"
                            >
                              {copiedKey === `${copyPrefix}_url` ? <CheckIcon /> : <CopyIcon />}
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={rech.loginUrl}
                          onChange={(e) =>
                            setRechargeForms((prev) => ({
                              ...prev,
                              [p.id]: { ...rech, loginUrl: e.target.value },
                            }))
                          }
                          placeholder="https://..."
                          style={{
                            width: "100%",
                            background: "#ffffff",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "8px",
                            color: "var(--text-main)",
                            boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
                            padding: "8px 12px",
                            fontSize: "12px",
                            outline: "none",
                            fontFamily: "monospace",
                          }}
                        />
                      </div>

                      {/* Username & Password Grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        {/* Username */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)" }}>Recharge Username</label>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(rech.username, `${copyPrefix}_user`)}
                              style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0 2px" }}
                              title="Copy Username"
                            >
                              {copiedKey === `${copyPrefix}_user` ? <CheckIcon /> : <CopyIcon />}
                            </button>
                          </div>
                          <input
                            type="text"
                            value={rech.username}
                            onChange={(e) =>
                              setRechargeForms((prev) => ({
                                ...prev,
                                [p.id]: { ...rech, username: e.target.value },
                              }))
                            }
                            placeholder="Recharge Username"
                            autoComplete="off"
                            style={{
                              width: "100%",
                              background: "#ffffff",
                              border: "1px solid rgba(148,163,184,0.18)",
                              borderRadius: "8px",
                              color: "var(--text-main)",
                              padding: "8px 12px",
                              fontSize: "12px",
                              outline: "none",
                            }}
                          />
                        </div>

                        {/* Password */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-dim)" }}>Recharge Password</label>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowRechargePassword((prev) => ({
                                    ...prev,
                                    [p.id]: !prev[p.id],
                                  }))
                                }
                                style={{ background: "none", border: "none", color: isPassVisible ? "var(--amber)" : "var(--text-dim)", cursor: "pointer", padding: "0 2px", display: "flex", alignItems: "center" }}
                                title={isPassVisible ? "Hide Password" : "Show Password"}
                              >
                                <EyeIcon visible={isPassVisible} />
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(rech.password, `${copyPrefix}_pass`)}
                                style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", padding: "0 2px" }}
                                title="Copy Password"
                              >
                                {copiedKey === `${copyPrefix}_pass` ? <CheckIcon /> : <CopyIcon />}
                              </button>
                            </div>
                          </div>
                          <input
                            type={isPassVisible ? "text" : "password"}
                            value={rech.password}
                            onChange={(e) =>
                              setRechargeForms((prev) => ({
                                ...prev,
                                [p.id]: { ...rech, password: e.target.value },
                              }))
                            }
                            placeholder="Recharge Password"
                            autoComplete="new-password"
                            style={{
                              width: "100%",
                              background: "#ffffff",
                              border: "1px solid rgba(148,163,184,0.18)",
                              borderRadius: "8px",
                              color: "var(--text-main)",
                              padding: "8px 12px",
                              fontSize: "12px",
                              outline: "none",
                              fontFamily: isPassVisible ? "inherit" : "monospace",
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Bottom Save bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(148,163,184,0.08)", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ fontSize: "11px", maxWidth: "260px" }}>
                        {testRechargeResult[p.id] ? (
                          <span style={{ color: testRechargeResult[p.id]?.ok ? "var(--emerald)" : "var(--rose)", fontWeight: 600 }}>
                            {testRechargeResult[p.id]?.ok ? "✓ " : "✗ "}
                            {testRechargeResult[p.id]?.msg}
                          </span>
                        ) : (
                          <span style={{ color: notice ? "var(--emerald)" : "var(--text-dim)", fontWeight: notice ? 600 : 400 }}>
                            {notice || "Changes save to database & automation"}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick={() => testRechargeCredentials(p)}
                          disabled={Boolean(testingRecharge[p.id])}
                          style={{
                            background: "var(--amber-light)",
                            border: "1px solid rgba(245,158,11,0.3)",
                            color: "var(--amber)",
                            borderRadius: "6px",
                            padding: "6px 12px",
                            fontSize: "11px",
                            fontWeight: 600,
                            cursor: Boolean(testingRecharge[p.id]) ? "not-allowed" : "pointer",
                          }}
                        >
                          {Boolean(testingRecharge[p.id]) ? "Testing…" : "⚡ Test Login"}
                        </button>
                        <button
                          type="button"
                          onClick={() => saveRechargeCredentials(p)}
                          disabled={isSaving}
                          style={{
                            background: isSaving ? "var(--text-dim)" : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            padding: "6px 16px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: isSaving ? "not-allowed" : "pointer",
                            boxShadow: "0 2px 8px rgba(217,119,6,0.2)",
                          }}
                        >
                          {isSaving ? "Saving…" : "Save Recharge"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD PROVIDER                                                       */}
      {/* ========================================================================= */}
      {showAdd && (
        <Modal title="Add New Provider" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAddSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "4px", display: "block", fontWeight: 600 }}>Provider Code *</label>
                <input
                  style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "8px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "8px 12px", fontSize: "12px", textTransform: "uppercase" }}
                  value={addForm.code}
                  onChange={(e) => setAddForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. ICC, ICON, or RANKS"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: "var(--text-dim)", marginBottom: "4px", display: "block", fontWeight: 600 }}>Internal Name *</label>
                <input
                  style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "8px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "8px 12px", fontSize: "12px" }}
                  value={addForm.name}
                  onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. ICC Admin Panel"
                  required
                />
              </div>
            </div>

            {/* KYC Credentials Section */}
            <div style={{ background: "var(--sky-blue-light)", border: "1px solid rgba(2, 132, 199, 0.2)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--sky-blue)", textTransform: "uppercase" }}>1. KYC Automation Credentials</span>
              <div>
                <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "3px", fontWeight: 600 }}>KYC Login URL</label>
                <input
                  style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "6px 10px", fontSize: "12px" }}
                  value={addForm.loginUrl}
                  onChange={(e) => setAddForm((f) => ({ ...f, loginUrl: e.target.value }))}
                  placeholder="https://provider.com/admin/login"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "3px", fontWeight: 600 }}>KYC Username</label>
                  <input
                    style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "6px 10px", fontSize: "12px" }}
                    value={addForm.username}
                    onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="Username"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "3px", fontWeight: 600 }}>KYC Password</label>
                  <input
                    style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "6px 10px", fontSize: "12px" }}
                    type="password"
                    value={addForm.password}
                    onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Password"
                  />
                </div>
              </div>
            </div>

            {/* Recharge Credentials Section */}
            <div style={{ background: "var(--amber-light)", border: "1px solid var(--amber-border)", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase" }}>2. Recharge Automation Credentials</span>
              <div>
                <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "3px", fontWeight: 600 }}>Recharge Login URL</label>
                <input
                  style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "6px 10px", fontSize: "12px" }}
                  value={addForm.rechargeLoginUrl}
                  onChange={(e) => setAddForm((f) => ({ ...f, rechargeLoginUrl: e.target.value }))}
                  placeholder="https://icctalk.com/login"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "3px", fontWeight: 600 }}>Recharge Username</label>
                  <input
                    style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "6px 10px", fontSize: "12px" }}
                    value={addForm.rechargeUsername}
                    onChange={(e) => setAddForm((f) => ({ ...f, rechargeUsername: e.target.value }))}
                    placeholder="Username"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "10px", color: "var(--text-dim)", display: "block", marginBottom: "3px", fontWeight: 600 }}>Recharge Password</label>
                  <input
                    style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "6px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "6px 10px", fontSize: "12px" }}
                    type="password"
                    value={addForm.rechargePassword}
                    onChange={(e) => setAddForm((f) => ({ ...f, rechargePassword: e.target.value }))}
                    placeholder="Password"
                  />
                </div>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", color: "var(--text-dim)", display: "block", marginBottom: "4px", fontWeight: 600 }}>Notes</label>
              <input
                style={{ width: "100%", background: "#ffffff", border: "1px solid var(--border-subtle)", borderRadius: "8px", color: "var(--text-main)", boxShadow: "0 1px 2px rgba(15,23,42,0.03)", padding: "8px 12px", fontSize: "12px" }}
                value={addForm.notes}
                onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional provider notes"
              />
            </div>

            {addError && <p style={{ color: "var(--rose)", fontSize: "12px", margin: 0 }}>{addError}</p>}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                style={{ background: "var(--bg-beige)", color: "var(--text-main)", border: "1px solid var(--border-subtle)", borderRadius: "8px", padding: "8px 16px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                {addLoading ? "Creating…" : "Add Provider"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE CONFIRMATION                                                */}
      {/* ========================================================================= */}
      {deleteTarget && (
        <Modal title="Delete Provider" onClose={() => setDeleteTarget(null)}>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "20px" }}>
            Are you sure you want to delete provider <strong style={{ color: "var(--text-main)" }}>{deleteTarget.code}</strong>? This will fail if numbers are assigned.
          </p>
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button
              onClick={() => setDeleteTarget(null)}
              style={{ background: "var(--border-subtle)", color: "var(--text-dim)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: "8px", padding: "8px 16px", fontSize: "12px", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              style={{ background: "var(--rose)", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}
