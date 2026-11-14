"use client";

import React, { useState, useEffect } from "react";
import ResellerLayout from "@/components/ResellerLayout";

export default function ResellerSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [form, setForm] = useState({
    companyName: "",
    brandName: "",
    logoUrl: "",
    brandColor: "#0284c7",
    subdomain: "",
    customDomain: "",
    supportEmail: "",
    supportPhone: "",
    defaultNumberPricingMode: "CUSTOM",
    defaultNumberPrice: "",
    currentPassword: "",
    newPassword: "",
  });

  const [resellerId, setResellerId] = useState("");

  useEffect(() => {
    fetch("/api/reseller/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.reseller) {
          const r = data.reseller;
          setResellerId(r.id);
          setForm({
            companyName: r.companyName || "",
            brandName: r.brandName || "",
            logoUrl: r.logoUrl || "",
            brandColor: r.brandColor || "#0284c7",
            subdomain: r.subdomain || "",
            customDomain: r.customDomain || "",
            supportEmail: r.supportEmail || "",
            supportPhone: r.supportPhone || "",
            defaultNumberPricingMode: r.defaultNumberPricingMode || "CUSTOM",
            defaultNumberPrice: r.defaultNumberPrice !== null ? String(r.defaultNumberPrice) : "",
            currentPassword: "",
            newPassword: "",
          });
        }
      })
      .catch(() => setErrorMsg("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/reseller/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to save settings");
        setSaving(false);
        return;
      }

      setSuccessMsg("Branding & White-Label settings saved successfully!");
      setForm((prev) => ({ ...prev, currentPassword: "", newPassword: "" }));
    } catch {
      setErrorMsg("Network error saving settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResellerLayout
      title="White-Label & Branding Settings"
      subtitle="Customize your partner portal identity, client experience, logo, domain, and colors"
    >
      <div style={{ maxWidth: "1280px" }}>
        {/* Alerts */}
        {errorMsg && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b" }}>✕</button>
          </div>
        )}
        {successMsg && (
          <div style={{ padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }}>
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534" }}>✕</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "24px" }}>
          {/* Left Form */}
          <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginBottom: "16px" }}>
              Brand Identity Configuration
            </h3>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>White-Label Brand Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Telecom Express"
                    value={form.brandName}
                    onChange={(e) => setForm({ ...form, brandName: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Company Legal Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Telecom Express BD Ltd."
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Brand Logo Image URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={form.logoUrl}
                  onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Primary Theme Color</label>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="color"
                    value={form.brandColor}
                    onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                    style={{ width: "42px", height: "42px", padding: 0, border: "none", borderRadius: "6px", cursor: "pointer" }}
                  />
                  <input
                    type="text"
                    value={form.brandColor}
                    onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                    style={{ width: "120px", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px", fontFamily: "monospace" }}
                  />
                  <div style={{ display: "flex", gap: "6px" }}>
                    {["#0284c7", "#2563eb", "#7c3aed", "#059669", "#dc2626", "#ea580c"].map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setForm({ ...form, brandColor: color })}
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: color,
                          border: form.brandColor === color ? "2px solid #000" : "1px solid rgba(0,0,0,0.1)",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Subdomain & Custom Domain */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginBottom: "10px" }}>Domain &amp; Access Routing</h4>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Subdomain Prefix</label>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <input
                      type="text"
                      placeholder="e.g. telexpress"
                      value={form.subdomain}
                      onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "6px 0 0 6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                    />
                    <span style={{ background: "#f1f5f9", padding: "8px 12px", border: "1px solid #cbd5e1", borderLeft: "none", borderRadius: "0 6px 6px 0", fontSize: "13px", color: "#64748b" }}>
                      .softcents.com
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Custom Domain (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. portal.yourdomain.com"
                    value={form.customDomain}
                    onChange={(e) => setForm({ ...form, customDomain: e.target.value.toLowerCase().trim() })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                    Point a CNAME record to <code>number-portal.softcents.com</code> in your domain DNS manager.
                  </div>
                </div>
              </div>

              {/* Subscriber Number Pricing Policy */}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <h4 style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                  🏷️ Default Subscriber Number Pricing Policy
                </h4>
                <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 12px 0" }}>
                  Control whether your subscribers get numbers for <strong>FREE (৳0.00)</strong> or pay your custom rate, regardless of Admin rates.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px",
                      borderRadius: "6px",
                      border: `1.5px solid ${form.defaultNumberPricingMode === "CUSTOM" ? "#0284c7" : "#e2e8f0"}`,
                      background: form.defaultNumberPricingMode === "CUSTOM" ? "#f0f9ff" : "#ffffff",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    <input
                      type="radio"
                      name="pricingPolicy"
                      checked={form.defaultNumberPricingMode === "CUSTOM"}
                      onChange={() => setForm({ ...form, defaultNumberPricingMode: "CUSTOM" })}
                    />
                    <div>
                      <strong style={{ color: "#0f172a" }}>Per-Number Custom Pricing</strong>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Control price or free per number</div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px",
                      borderRadius: "6px",
                      border: `1.5px solid ${form.defaultNumberPricingMode === "FREE_ALL" ? "#10b981" : "#e2e8f0"}`,
                      background: form.defaultNumberPricingMode === "FREE_ALL" ? "#f0fdf4" : "#ffffff",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    <input
                      type="radio"
                      name="pricingPolicy"
                      checked={form.defaultNumberPricingMode === "FREE_ALL"}
                      onChange={() => setForm({ ...form, defaultNumberPricingMode: "FREE_ALL" })}
                    />
                    <div>
                      <strong style={{ color: "#166534" }}>Make ALL Numbers FREE (৳0.00)</strong>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Instant free claim for subscribers</div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px",
                      borderRadius: "6px",
                      border: `1.5px solid ${form.defaultNumberPricingMode === "FIXED_PRICE" ? "#0284c7" : "#e2e8f0"}`,
                      background: form.defaultNumberPricingMode === "FIXED_PRICE" ? "#f0f9ff" : "#ffffff",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    <input
                      type="radio"
                      name="pricingPolicy"
                      checked={form.defaultNumberPricingMode === "FIXED_PRICE"}
                      onChange={() => setForm({ ...form, defaultNumberPricingMode: "FIXED_PRICE" })}
                    />
                    <div>
                      <strong style={{ color: "#0369a1" }}>Fixed Custom Price for ALL</strong>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Charge uniform price across portal</div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px",
                      borderRadius: "6px",
                      border: `1.5px solid ${form.defaultNumberPricingMode === "ADMIN_RATE" ? "#0284c7" : "#e2e8f0"}`,
                      background: form.defaultNumberPricingMode === "ADMIN_RATE" ? "#f0f9ff" : "#ffffff",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    <input
                      type="radio"
                      name="pricingPolicy"
                      checked={form.defaultNumberPricingMode === "ADMIN_RATE"}
                      onChange={() => setForm({ ...form, defaultNumberPricingMode: "ADMIN_RATE" })}
                    />
                    <div>
                      <strong style={{ color: "#475569" }}>Admin Standard Base Rate</strong>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Default to Admin catalog rates</div>
                    </div>
                  </label>
                </div>

                {form.defaultNumberPricingMode === "FIXED_PRICE" && (
                  <div style={{ maxWidth: "260px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>
                      Fixed Selling Price (BDT)
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontWeight: 700, color: "#64748b" }}>৳</span>
                      <input
                        type="number"
                        placeholder="e.g. 150"
                        value={form.defaultNumberPrice}
                        onChange={(e) => setForm({ ...form, defaultNumberPrice: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px 8px 28px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px", fontWeight: 700 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Support Contacts */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Support Email</label>
                  <input
                    type="email"
                    placeholder="support@yourbrand.com"
                    value={form.supportEmail}
                    onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>Support Phone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="017XXXXXXXX"
                    value={form.supportPhone}
                    onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "14px" }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "10px 24px",
                  borderRadius: "8px",
                  border: "none",
                  background: form.brandColor,
                  color: "#ffffff",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving Changes..." : "Save Branding Settings"}
              </button>
            </form>
          </div>

          {/* Right: Live Preview Box */}
          <div>
            <div style={{ background: "#ffffff", padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", position: "sticky", top: "80px" }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginBottom: "12px" }}>
                Live Client Portal Preview
              </h4>
              <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "16px" }}>
                This is how your subscribers will see their number management interface:
              </p>

              {/* Simulated Portal Header */}
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="Logo" style={{ maxHeight: "32px", maxWidth: "60px", objectFit: "contain" }} />
                  ) : (
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "6px",
                        background: form.brandColor,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                    >
                      {form.brandName ? form.brandName.charAt(0).toUpperCase() : "B"}
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
                      {form.brandName || "Your Brand Name"}
                    </div>
                    <div style={{ fontSize: "10px", color: "#64748b" }}>
                      Subscriber Portal
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <span style={{ fontSize: "10px", background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0", padding: "3px 6px", borderRadius: "4px", fontWeight: 600 }}>
                    Online
                  </span>
                </div>
              </div>

              {/* Simulated Customer Actions */}
              <div style={{ marginTop: "16px", background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
                  Subscriber Direct Link:
                </div>
                <div style={{ fontSize: "11px", background: "#ffffff", padding: "8px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontFamily: "monospace", wordBreak: "break-all" }}>
                  https://number-portal.softcents.com/portal?resellerId={resellerId}
                </div>
                <div style={{ marginTop: "12px" }}>
                  <a
                    href={`/portal?resellerId=${resellerId}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: "8px",
                      borderRadius: "6px",
                      background: form.brandColor,
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    Launch Live Client Portal ↗
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResellerLayout>
  );
}
