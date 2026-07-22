"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/admin/PageHeader";
import DataTable from "@/components/admin/DataTable";
import { useRouter } from "next/navigation";

export default function ReceiptsPage() {
  const router = useRouter();
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const [form, setForm] = useState({
    party_type: "customer" as "customer" | "income_account",
    customer_id: "", income_account_id: "",
    invoice_number: "", amount: "",
    payment_type: "cash" as "cash" | "bank",
    reference_number: "",
    bank_account: "",
    cheque_number: "",
    cheque_date: "",
    narration: "", receipt_date: new Date().toISOString().split("T")[0],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [rr, cr, br, ir] = await Promise.all([
        api.get("/receipts/"),
        api.get("/users/"),
        api.get("/bank_accounts/bank-accounts"),
        api.get("/accounting/income-accounts"),
      ]);
      setReceipts(Array.isArray(rr.data) ? rr.data : []);
      setCustomers(Array.isArray(cr.data) ? cr.data.filter((u: any) => u.role === "customer") : []);
      setBankAccounts(Array.isArray(br.data) ? br.data : []);
      setIncomeAccounts(Array.isArray(ir.data) ? ir.data : []);
    } catch { setReceipts([]); } finally { setLoading(false); }
  };

  const loadInvoices = async (customerId: string) => {
    if (!customerId) return;
    try {
      const res = await api.get(`/invoices/?limit=50`);
      setInvoices(Array.isArray(res.data) ? res.data.filter((i: any) => i.customer_id === parseInt(customerId) && i.balance_due > 0) : []);
    } catch { setInvoices([]); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({
    party_type: "customer", customer_id: "", income_account_id: "",
    invoice_number: "", amount: "",
    payment_type: "cash", reference_number: "", bank_account: "",
    cheque_number: "", cheque_date: "",
    narration: "", receipt_date: new Date().toISOString().split("T")[0],
  });

  const save = async () => {
    if (form.party_type === "customer" && !form.customer_id) { alert("Please select a customer"); return; }
    if (form.party_type === "income_account" && !form.income_account_id) { alert("Please select an income account"); return; }
    if (!form.amount) { alert("Amount is required"); return; }
    if (form.payment_type === "bank" && !form.bank_account) {
      alert("Please select which company bank account received the payment");
      return;
    }
    setSaving(true);
    try {
      const payment_mode = form.payment_type === "cash"
        ? "cash"
        : (form.cheque_number ? "cheque" : "bank_transfer");

      await api.post("/receipts/", {
        party_type: form.party_type,
        customer_id: form.party_type === "customer" ? parseInt(form.customer_id) : undefined,
        income_account_id: form.party_type === "income_account" ? parseInt(form.income_account_id) : undefined,
        invoice_number: form.party_type === "customer" ? (form.invoice_number || undefined) : undefined,
        amount: parseFloat(form.amount),
        payment_mode,
        receipt_date: form.receipt_date,
        narration: form.narration || undefined,
        reference_number: form.payment_type === "bank" ? (form.reference_number || undefined) : undefined,
        bank_account: form.payment_type === "bank" ? form.bank_account : undefined,
        cheque_number: form.payment_type === "bank" ? (form.cheque_number || undefined) : undefined,
        cheque_date: form.payment_type === "bank" ? (form.cheque_date || undefined) : undefined,
      });
      setShowForm(false);
      resetForm();
      load();
    } catch (e: any) { alert(e.response?.data?.detail || "Failed to save"); }
    finally { setSaving(false); }
  };

  const fmt = (n: any) => `AED ${parseFloat(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
  const inp = { width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };
  const lbl = { fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 5 } as const;

  const columns = [
    { key: "receipt_number", label: "Receipt #", render: (r: any) => (
      <span style={{ fontWeight: 600, color: "#0284c7", cursor: "pointer" }}
        onClick={() => router.push(`/admin/accounting/receipts/${encodeURIComponent(r.receipt_number)}`)}>
        {r.receipt_number}
      </span>
    )},
    { key: "receipt_date", label: "Date", render: (r: any) => new Date(r.receipt_date).toLocaleDateString("en-AE") },
    { key: "party", label: "Received From", render: (r: any) =>
      r.party_type === "income_account"
        ? <span>{r.income_account_name || `Account #${r.income_account_id}`} <span style={{ fontSize: 10, color: "#94a3b8" }}>(Income)</span></span>
        : (customers.find(c => c.id === r.customer_id)?.name || `Customer #${r.customer_id}`)
    },
    { key: "amount", label: "Amount", render: (r: any) => <span style={{ fontWeight: 600, color: "#16a34a" }}>{fmt(r.amount)}</span> },
    { key: "payment_mode", label: "Mode", render: (r: any) => <span style={{ fontSize: 12, background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>{r.payment_mode}</span> },
    { key: "narration", label: "Narration", render: (r: any) => <span style={{ fontSize: 12, color: "#64748b" }}>{r.narration || "—"}</span> },
    { key: "status", label: "Status", render: (r: any) => r.status === "cancelled"
      ? <span style={{ fontSize: 11, fontWeight: 600, color: "#991b1b", background: "#fee2e2", padding: "2px 8px", borderRadius: 20 }}>CANCELLED</span>
      : <span style={{ fontSize: 11, color: "#16a34a" }}>Active</span>
    },
    { key: "actions", label: "", render: (r: any) => (
      <button
        onClick={() => router.push(`/admin/accounting/receipts/${encodeURIComponent(r.receipt_number)}?edit=true`)}
        style={{ fontSize: 12, color: "#0284c7", background: "#eff6ff", border: "none", cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontWeight: 600 }}
      >Edit →</button>
    )},
  ];

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Receipt Vouchers" subtitle="Record incoming payments from customers or other income"
        action={<button className="btn-primary" onClick={() => setShowForm(true)}>+ New Receipt</button>} />

      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>New Receipt Voucher</h3>

          {/* Received From: Customer / Income Account */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Received From *</label>
            <div style={{ display: "inline-flex", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 4 }}>
              <button type="button"
                onClick={() => setForm({ ...form, party_type: "customer", income_account_id: "" })}
                style={{ padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: form.party_type === "customer" ? "#0284c7" : "transparent",
                  color: form.party_type === "customer" ? "#fff" : "#475569" }}>
                Customer
              </button>
              <button type="button"
                onClick={() => setForm({ ...form, party_type: "income_account", customer_id: "", invoice_number: "" })}
                style={{ padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: form.party_type === "income_account" ? "#0284c7" : "transparent",
                  color: form.party_type === "income_account" ? "#fff" : "#475569" }}>
                Income Account
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 14 }}>
            <div>
              <label style={lbl}>Payment Type *</label>
              <div
                onClick={() => setForm({ ...form, payment_type: form.payment_type === "cash" ? "bank" : "cash" })}
                style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", background: "#f1f5f9", borderRadius: 999, padding: 4, width: 200, position: "relative" }}>
                <div style={{ position: "absolute", top: 4, left: form.payment_type === "cash" ? 4 : 100, width: 96, height: 32, borderRadius: 999, background: "#0284c7", transition: "left 0.2s ease" }} />
                <div style={{ flex: 1, textAlign: "center", zIndex: 1, padding: "6px 0", fontSize: 13, fontWeight: 600, color: form.payment_type === "cash" ? "#fff" : "#475569" }}>Cash</div>
                <div style={{ flex: 1, textAlign: "center", zIndex: 1, padding: "6px 0", fontSize: 13, fontWeight: 600, color: form.payment_type === "bank" ? "#fff" : "#475569" }}>Bank</div>
              </div>
            </div>
            <div style={{ width: 200 }}>
              <label style={lbl}>Receipt Date</label>
              <input type="date" style={inp} value={form.receipt_date} onChange={e => setForm({ ...form, receipt_date: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {form.party_type === "customer" ? (
              <>
                <div>
                  <label style={lbl}>Customer *</label>
                  <select style={inp} value={form.customer_id}
                    onChange={e => { setForm({ ...form, customer_id: e.target.value, invoice_number: "" }); loadInvoices(e.target.value); }}>
                    <option value="">Select customer</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Against Invoice</label>
                  <select style={inp} value={form.invoice_number}
                    onChange={e => {
                      const inv = invoices.find(i => i.invoice_number === e.target.value);
                      setForm({ ...form, invoice_number: e.target.value, amount: inv ? String(inv.balance_due) : form.amount });
                    }}>
                    <option value="">Select invoice (optional)</option>
                    {invoices.map(i => <option key={i.invoice_number} value={i.invoice_number}>{i.invoice_number} — Balance: {fmt(i.balance_due)}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div style={{ gridColumn: "1/span 2" }}>
                <label style={lbl}>Income Account *</label>
                <select style={inp} value={form.income_account_id} onChange={e => setForm({ ...form, income_account_id: e.target.value })}>
                  <option value="">Select income account</option>
                  {incomeAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {incomeAccounts.length === 0 && (
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>No income accounts set up yet in Chart of Accounts.</p>
                )}
              </div>
            )}
            <div>
              <label style={lbl}>Amount AED *</label>
              <input type="number" style={inp} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>

            {form.payment_type === "cash" ? (
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Narration</label>
                <input style={inp} value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} placeholder="Payment description" />
              </div>
            ) : (
              <>
                <div>
                  <label style={lbl}>Cheque Date</label>
                  <input type="date" style={inp} value={form.cheque_date} onChange={e => setForm({ ...form, cheque_date: e.target.value })} />
                </div>
                <div>
                  <label style={lbl}>Cheque No.</label>
                  <input style={inp} value={form.cheque_number} onChange={e => setForm({ ...form, cheque_number: e.target.value })} placeholder="Cheque number" />
                </div>
                <div>
                  <label style={lbl}>Received Into (Company Bank) *</label>
                  <select style={inp} value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })}>
                    <option value="">Select bank account</option>
                    {bankAccounts.map((acc: any) => <option key={acc.id} value={acc.label}>{acc.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>{form.party_type === "customer" ? "Customer Bank Name (Reference)" : "Reference"}</label>
                  <input style={inp} value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} placeholder="Reference" />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Narration</label>
                  <input style={inp} value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} placeholder="Payment description (optional)" />
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Receipt"}</button>
            <button className="btn-outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <DataTable columns={columns} data={receipts} loading={loading} emptyText="No receipts yet" keyField="receipt_number" />
      </div>
    </div>
  );
}