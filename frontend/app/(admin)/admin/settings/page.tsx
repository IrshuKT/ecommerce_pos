"use client";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/admin/PageHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000";

const UAE_EMIRATES = [
  "Abu Dhabi", "Dubai", "Sharjah", "Ajman",
  "Umm Al Quwain", "Ras Al Khaimah", "Fujairah",
];

const TABS = [
  { key: "basic", label: "Basic Information" },
  { key: "address", label: "Business Address" },
  { key: "tax", label: "Tax & Legal" },
  { key: "bank", label: "Bank Details" },
  { key: "invoice", label: "Invoice Settings" },
];

// Matches the shape returned by /accounting/bank-accounts.
// `id` is a real Account.id once saved; new unsaved rows use a temp string id.
type BankAccount = {
  id: number | string;
  isNew?: boolean;
  code?: string;
  label: string;
  bank_name: string;
  account_number: string;
  iban: string;
  branch: string;
  swift_code?: string;
  currency?: string;
  is_default: boolean;
};

const blankBankAccount = (): BankAccount => ({
  id: `new_${Date.now()}`,
  isNew: true,
  label: "",
  bank_name: "",
  account_number: "",
  iban: "",
  branch: "",
  swift_code: "",
  currency: "AED",
  is_default: false,
});

export default function SettingsPage() {
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");
  const logoRef = useRef<HTMLInputElement>(null);

  // Bank accounts now live on their own resource (Account rows), not the
  // settings JSON blob — separate load/save lifecycle from the rest of the form.
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [savingBankId, setSavingBankId] = useState<string | number | null>(null);

  useEffect(() => {
    api.get("/settings/").then(r => {
      setForm(r.data || {});
      setLoading(false);
    }).catch(() => setLoading(false));

    loadBankAccounts();
  }, []);

  const loadBankAccounts = async () => {
    setBankLoading(true);
    try {
      const r = await api.get("/bank_accounts/bank-accounts");
      setBankAccounts(r.data || []);
    } catch {
      // non-fatal — leave list empty, card-level actions still work once retried
    } finally {
      setBankLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/settings/", form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { alert(e.response?.data?.detail || "Failed to save"); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/settings/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm({ ...form, logo_url: res.data.logo_url });
    } catch { alert("Failed to upload logo"); }
    finally { setUploadingLogo(false); }
  };

  const inp = { width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };
  const lbl = { fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 5 } as const;
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // ---- Bank account handlers -------------------------------------------

  const addBankAccountRow = () => {
    setBankAccounts([...bankAccounts, blankBankAccount()]);
  };

  const updateBankField = (id: string | number, key: keyof BankAccount, value: string) => {
    setBankAccounts(bankAccounts.map(a => a.id === id ? { ...a, [key]: value } : a));
  };

  const saveBankAccount = async (acc: BankAccount) => {
    if (!acc.label || !acc.bank_name || !acc.account_number || !acc.iban) {
      alert("Label, bank name, account number and IBAN are required.");
      return;
    }
    setSavingBankId(acc.id);
    try {
      const payload = {
        label: acc.label,
        bank_name: acc.bank_name,
        account_number: acc.account_number,
        iban: acc.iban,
        branch: acc.branch || undefined,
        swift_code: acc.swift_code || undefined,
        currency: acc.currency || "AED",
      };
      if (acc.isNew) {
        const res = await api.post("/bank_accounts/bank-accounts", payload);
        setBankAccounts(prev => prev.map(a => a.id === acc.id ? res.data : a));
      } else {
        const res = await api.patch(`/bank_accounts/bank-accounts/${acc.id}`, payload);
        setBankAccounts(prev => prev.map(a => a.id === acc.id ? res.data : a));
      }
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to save bank account");
    } finally {
      setSavingBankId(null);
    }
  };

  const removeBankAccount = async (acc: BankAccount) => {
    if (acc.isNew) {
      // never persisted — just drop it locally
      setBankAccounts(prev => prev.filter(a => a.id !== acc.id));
      return;
    }
    if (!confirm(`Remove "${acc.label}"? It will stop appearing on vouchers.`)) return;
    try {
      await api.delete(`/bank_accounts/bank-accounts/${acc.id}`);
      await loadBankAccounts(); // re-fetch so the new default (if any) is reflected
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to remove bank account");
    }
  };

  const setDefaultBankAccount = async (acc: BankAccount) => {
    if (acc.isNew) {
      alert("Save this account first before setting it as default.");
      return;
    }
    try {
      await api.post(`/bank_accounts/bank-accounts/${acc.id}/set-default`);
      await loadBankAccounts();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to set default account");
    }
  };

  // ------------------------------------------------------------------------

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading...</div>;

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <PageHeader title="Company Settings" subtitle="Business information used in invoices, emails and shop frontend"
        action={
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
          </button>
        }
      />

      {/* Logo — always visible above tabs */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>Company Logo</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 100, height: 100, borderRadius: 12, border: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {form.logo_url
              ? <img src={`${API_BASE}${form.logo_url}`} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              : <span style={{ fontSize: 32 }}>🏢</span>}
          </div>
          <div>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo} className="btn-outline">
              {uploadingLogo ? "Uploading..." : "Upload Logo"}
            </button>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "6px 0 0" }}>PNG, JPG, SVG — Max 2MB. Recommended: 200×200px</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 20 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 18px",
              fontSize: 13.5,
              fontWeight: 600,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: activeTab === tab.key ? "#0284c7" : "#64748b",
              borderBottom: activeTab === tab.key ? "2px solid #0284c7" : "2px solid transparent",
              marginBottom: -1,
              transition: "color 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        {activeTab === "basic" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Company Name *</label>
              <input style={inp} value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} placeholder="Your Company Name" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Tagline</label>
              <input style={inp} value={form.tagline || ""} onChange={e => set("tagline", e.target.value)} placeholder="Premium Services for You" />
            </div>
            <div>
              <label style={lbl}>Email</label>
              <input style={inp} type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} placeholder="hello@company.in" />
            </div>
            <div>
              <label style={lbl}>Phone</label>
              <input style={inp} value={form.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label style={lbl}>Mobile</label>
              <input style={inp} value={form.mobile || ""} onChange={e => set("mobile", e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div>
              <label style={lbl}>Website</label>
              <input style={inp} value={form.website || ""} onChange={e => set("website", e.target.value)} placeholder="https://glassstore.in" />
            </div>
          </div>
        )}

        {activeTab === "address" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Address Line 1</label>
              <input style={inp} value={form.address_line1 || ""} onChange={e => set("address_line1", e.target.value)} placeholder="Office/Warehouse No, Street, Area" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Address Line 2</label>
              <input style={inp} value={form.address_line2 || ""} onChange={e => set("address_line2", e.target.value)} placeholder="Landmark (optional)" />
            </div>
            <div>
              <label style={lbl}>City</label>
              <input style={inp} value={form.city || ""} onChange={e => set("city", e.target.value)} placeholder="Dubai" />
            </div>
            <div>
              <label style={lbl}>Emirate</label>
              <select style={inp} value={form.emirate || "Dubai"} onChange={e => set("emirate", e.target.value)}>
                {UAE_EMIRATES.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>PO Box / Pincode</label>
              <input style={inp} value={form.pincode || ""} onChange={e => set("pincode", e.target.value)} placeholder="PO Box (optional)" />
            </div>
            <div>
              <label style={lbl}>Country</label>
              <input style={inp} value={form.country || "United Arab Emirates"} onChange={e => set("country", e.target.value)} />
            </div>
          </div>
        )}

        {activeTab === "tax" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>TRN (Tax Registration Number)</label>
              <input style={inp} value={form.trn || ""} onChange={e => set("trn", e.target.value)} placeholder="100XXXXXXXXXXX03" maxLength={15} />
            </div>
            <div>
              <label style={lbl}>Default VAT Rate (%)</label>
              <input style={inp} type="number" step="0.01" value={form.default_vat_rate ?? 5.0} onChange={e => set("default_vat_rate", e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Currency Code</label>
              <input style={inp} value={form.currency_code || "AED"} onChange={e => set("currency_code", e.target.value.toUpperCase())} maxLength={5} />
            </div>
            <div>
              <label style={lbl}>Currency Symbol</label>
              <input style={inp} value={form.currency_symbol || "AED"} onChange={e => set("currency_symbol", e.target.value)} maxLength={5} />
            </div>
          </div>
        )}

        {activeTab === "bank" && (
          <div>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>
              Add every company bank account you receive into or pay from. These appear as a dropdown on Receipt and
              Payment vouchers. Each account is saved individually and posts through the Chart of Accounts under
              "Bank Accounts" — mark one as default to have it pre-selected on new vouchers.
            </p>

            {bankLoading && (
              <p style={{ fontSize: 13, color: "#94a3b8" }}>Loading bank accounts...</p>
            )}

            {!bankLoading && bankAccounts.length === 0 && (
              <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 16px" }}>No bank accounts added yet.</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {bankAccounts.map((acc, idx) => (
                <div key={acc.id} style={{ border: acc.is_default ? "1px solid #0284c7" : "1px solid #e2e8f0", borderRadius: 10, padding: 16, position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Account {idx + 1}</span>
                      {acc.code && <span style={{ fontSize: 11, color: "#94a3b8" }}>COA {acc.code}</span>}
                      {acc.is_default && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#0284c7", background: "#e0f2fe", padding: "2px 8px", borderRadius: 999 }}>
                          Default
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 14 }}>
                      {!acc.is_default && !acc.isNew && (
                        <button
                          onClick={() => setDefaultBankAccount(acc)}
                          style={{ fontSize: 12, color: "#0284c7", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                        >
                          Set as default
                        </button>
                      )}
                      <button
                        onClick={() => removeBankAccount(acc)}
                        style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ gridColumn: "1/-1" }}>
                      <label style={lbl}>Label (shown in dropdown)</label>
                      <input style={inp} value={acc.label} onChange={e => updateBankField(acc.id, "label", e.target.value)} placeholder="e.g. ADCB — Current Account" />
                    </div>
                    <div>
                      <label style={lbl}>Bank Name</label>
                      <input style={inp} value={acc.bank_name} onChange={e => updateBankField(acc.id, "bank_name", e.target.value)} placeholder="Emirates NBD" />
                    </div>
                    <div>
                      <label style={lbl}>Account Number</label>
                      <input style={inp} value={acc.account_number} onChange={e => updateBankField(acc.id, "account_number", e.target.value)} placeholder="XXXXXXXXXXXX" />
                    </div>
                    <div>
                      <label style={lbl}>IBAN</label>
                      <input style={inp} value={acc.iban ?? ""} onChange={e => updateBankField(acc.id, "iban", e.target.value.toUpperCase())} placeholder="AE07 0331 2345 6789 0123 456" maxLength={34} />
                    </div>
                    <div>
                      <label style={lbl}>Branch</label>
                      <input style={inp} value={acc.branch ?? ""} onChange={e => updateBankField(acc.id, "branch", e.target.value)} placeholder="Sheikh Zayed Road, Dubai" />
                    </div>
                    <div>
                      <label style={lbl}>SWIFT Code</label>
                      <input style={inp} value={acc.swift_code ?? ""} onChange={e => updateBankField(acc.id, "swift_code", e.target.value.toUpperCase())} placeholder="EBILAEAD" />
                    </div>
                    <div>
                      <label style={lbl}>Currency</label>
                      <input style={inp} value={acc.currency ?? "AED"} onChange={e => updateBankField(acc.id, "currency", e.target.value.toUpperCase())} maxLength={5} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                    <button
                      onClick={() => saveBankAccount(acc)}
                      disabled={savingBankId === acc.id}
                      className="btn-primary"
                    >
                      {savingBankId === acc.id ? "Saving..." : acc.isNew ? "Add Account" : "Update Account"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={addBankAccountRow} className="btn-outline" style={{ marginTop: 14 }}>
              + Add Bank Account
            </button>
          </div>
        )}

        {activeTab === "invoice" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Invoice Prefix</label>
              <input style={inp} value={form.invoice_prefix || "INV"} onChange={e => set("invoice_prefix", e.target.value.toUpperCase())} placeholder="INV" maxLength={10} />
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>e.g. INV → INV-2506-0001</p>
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Payment Terms</label>
              <textarea style={{ ...inp, height: 70, resize: "vertical" as const }} value={form.invoice_terms || ""} onChange={e => set("invoice_terms", e.target.value)} placeholder="Payment due within 30 days. Late payments subject to 2% interest per month." />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Invoice Footer Note</label>
              <input style={inp} value={form.invoice_footer || ""} onChange={e => set("invoice_footer", e.target.value)} placeholder="Thank you for your business!" />
            </div>
          </div>
        )}
      </div>

      {activeTab !== "bank" && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={save} disabled={saving} className="btn-primary" style={{ minWidth: 140 }}>
            {saving ? "Saving..." : saved ? "✓ Saved!" : "Save All Changes"}
          </button>
        </div>
      )}
    </div>
  );
}