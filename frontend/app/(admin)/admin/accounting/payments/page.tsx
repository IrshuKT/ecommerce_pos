"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/admin/PageHeader";
import DataTable from "@/components/admin/DataTable";
import { useRouter } from "next/navigation";

export default function PaymentVouchersPage() {
  const router = useRouter();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState<any[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  const [form, setForm] = useState({
    party_type: "vendor" as "vendor" | "expense_account",
    vendor_id: "", expense_account_id: "",
    purchase_number: "", amount: "",
    payment_type: "cash" as "cash" | "bank",
    reference_number: "",
    bank_account: "",
    cheque_number: "",
    cheque_date: "",
    narration: "", payment_date: new Date().toISOString().split("T")[0],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [pr, vr, br, er] = await Promise.all([
        api.get("/payment-vouchers/"),
        api.get("/vendors/"),
        api.get("/bank_accounts/bank-accounts"),
        api.get("/accounting/expense-accounts"),
      ]);
      setPayments(Array.isArray(pr.data) ? pr.data : []);
      setVendors(vr.data || []);
      setBankAccounts(Array.isArray(br.data) ? br.data : []);
      setExpenseAccounts(Array.isArray(er.data) ? er.data : []);
    } catch { setPayments([]); } finally { setLoading(false); }
  };

  const loadPurchases = async (vendorId: string) => {
    if (!vendorId) return;
    try {
      const res = await api.get(`/purchases/?vendor_id=${vendorId}`);
      setPurchases(Array.isArray(res.data) ? res.data.filter((p: any) => p.balance_due > 0) : []);
    } catch { setPurchases([]); }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({
    party_type: "vendor", vendor_id: "", expense_account_id: "",
    purchase_number: "", amount: "",
    payment_type: "cash", reference_number: "", bank_account: "",
    cheque_number: "", cheque_date: "",
    narration: "", payment_date: new Date().toISOString().split("T")[0],
  });

  const save = async () => {
    if (form.party_type === "vendor" && !form.vendor_id) { alert("Please select a vendor"); return; }
    if (form.party_type === "expense_account" && !form.expense_account_id) { alert("Please select an expense account"); return; }
    if (!form.amount) { alert("Amount is required"); return; }
    if (form.payment_type === "bank" && !form.bank_account) {
      alert("Please select which company bank account paid this");
      return;
    }
    setSaving(true);
    try {
      const payment_mode = form.payment_type === "cash"
        ? "cash"
        : (form.cheque_number ? "cheque" : "bank_transfer");

      await api.post("/payment-vouchers/", {
        party_type: form.party_type,
        vendor_id: form.party_type === "vendor" ? parseInt(form.vendor_id) : undefined,
        expense_account_id: form.party_type === "expense_account" ? parseInt(form.expense_account_id) : undefined,
        purchase_number: form.party_type === "vendor" ? (form.purchase_number || undefined) : undefined,
        amount: parseFloat(form.amount),
        payment_mode,
        payment_date: form.payment_date,
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
    { key: "payment_number", label: "Payment #", render: (r: any) => (
      <span style={{ fontWeight: 600, color: "#0284c7", cursor: "pointer" }}
        onClick={() => router.push(`/admin/accounting/payment-vouchers/${encodeURIComponent(r.payment_number)}`)}>
        {r.payment_number}
      </span>
    )},
    { key: "payment_date", label: "Date", render: (r: any) => new Date(r.payment_date).toLocaleDateString("en-AE") },
    { key: "party", label: "Paid To", render: (r: any) =>
      r.party_type === "expense_account"
        ? <span>{r.expense_account_name || `Account #${r.expense_account_id}`} <span style={{ fontSize: 10, color: "#94a3b8" }}>(Expense)</span></span>
        : (vendors.find(v => v.id === r.vendor_id)?.name || `Vendor #${r.vendor_id}`)
    },
    { key: "amount", label: "Amount", render: (r: any) => <span style={{ fontWeight: 600, color: "#dc2626" }}>{fmt(r.amount)}</span> },
    { key: "payment_mode", label: "Mode", render: (r: any) => <span style={{ fontSize: 12, background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, textTransform: "uppercase" }}>{r.payment_mode}</span> },
    { key: "narration", label: "Narration", render: (r: any) => <span style={{ fontSize: 12, color: "#64748b" }}>{r.narration || "—"}</span> },
    { key: "status", label: "Status", render: (r: any) => r.status === "cancelled"
      ? <span style={{ fontSize: 11, fontWeight: 600, color: "#991b1b", background: "#fee2e2", padding: "2px 8px", borderRadius: 20 }}>CANCELLED</span>
      : <span style={{ fontSize: 11, color: "#16a34a" }}>Active</span>
    },
    { key: "actions", label: "", render: (r: any) => (
      <button
        onClick={() => router.push(`/admin/accounting/payment-vouchers/${encodeURIComponent(r.payment_number)}?edit=true`)}
        style={{ fontSize: 12, color: "#0284c7", background: "#eff6ff", border: "none", cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontWeight: 600 }}
      >Edit →</button>
    )},
  ];

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Payment Vouchers" subtitle="Record outgoing payments to vendors or other expenses"
        action={<button className="btn-primary" onClick={() => setShowForm(true)}>+ New Payment</button>} />

      {showForm && (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>New Payment Voucher</h3>

          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Paid To *</label>
            <div style={{ display: "inline-flex", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 4 }}>
              <button type="button"
                onClick={() => setForm({ ...form, party_type: "vendor", expense_account_id: "" })}
                style={{ padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: form.party_type === "vendor" ? "#0284c7" : "transparent",
                  color: form.party_type === "vendor" ? "#fff" : "#475569" }}>
                Vendor
              </button>
              <button type="button"
                onClick={() => setForm({ ...form, party_type: "expense_account", vendor_id: "", purchase_number: "" })}
                style={{ padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: form.party_type === "expense_account" ? "#0284c7" : "transparent",
                  color: form.party_type === "expense_account" ? "#fff" : "#475569" }}>
                Expense Account
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
              <label style={lbl}>Payment Date</label>
              <input type="date" style={inp} value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            {form.party_type === "vendor" ? (
              <>
                <div>
                  <label style={lbl}>Vendor *</label>
                  <select style={inp} value={form.vendor_id}
                    onChange={e => { setForm({ ...form, vendor_id: e.target.value, purchase_number: "" }); loadPurchases(e.target.value); }}>
                    <option value="">Select vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Against Purchase</label>
                  <select style={inp} value={form.purchase_number}
                    onChange={e => {
                      const p = purchases.find(x => x.purchase_number === e.target.value);
                      setForm({ ...form, purchase_number: e.target.value, amount: p ? String(p.balance_due) : form.amount });
                    }}>
                    <option value="">Select purchase (optional)</option>
                    {purchases.map(p => <option key={p.purchase_number} value={p.purchase_number}>{p.purchase_number} — Balance: {fmt(p.balance_due)}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div style={{ gridColumn: "1/span 2" }}>
                <label style={lbl}>Expense Account *</label>
                <select style={inp} value={form.expense_account_id} onChange={e => setForm({ ...form, expense_account_id: e.target.value })}>
                  <option value="">Select expense account</option>
                  {expenseAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {expenseAccounts.length === 0 && (
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>No expense accounts set up yet in Chart of Accounts.</p>
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
                  <label style={lbl}>Paid From (Company Bank) *</label>
                  <select style={inp} value={form.bank_account} onChange={e => setForm({ ...form, bank_account: e.target.value })}>
                    <option value="">Select bank account</option>
                    {bankAccounts.map((acc: any) => <option key={acc.id} value={acc.label}>{acc.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Reference</label>
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
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Payment"}</button>
            <button className="btn-outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <DataTable columns={columns} data={payments} loading={loading} emptyText="No payment vouchers yet" keyField="payment_number" />
      </div>
    </div>
  );
}