"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

export default function ReceiptDetailPage() {
  const { receiptNumber: raw } = useParams();
  const receiptNumber = decodeURIComponent(raw as string);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(searchParams.get("edit") === "true");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [form, setForm] = useState({
    customer_name: "", invoice_number: "", amount: "",
    payment_mode: "cash",
    reference_number: "",
    bank_account: "",
    cheque_number: "",
    cheque_date: "",
    narration: "", receipt_date: new Date().toISOString().split("T")[0],
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = (await api.get(`/receipts/${receiptNumber}`)).data;
      setReceipt(r);
      setForm({
        customer_name: r.customer_name || `#${r.customer_id}`,
        invoice_number: r.invoice_number || "",
        amount: r.amount != null ? String(r.amount) : "",
        payment_mode: r.payment_mode || "cash",
        reference_number: r.reference_number || "",
        bank_account: r.bank_account || "",
        cheque_number: r.cheque_number || "",
        cheque_date: r.cheque_date || "",
        narration: r.narration || "",
        receipt_date: r.receipt_date ? String(r.receipt_date).split("T")[0] : new Date().toISOString().split("T")[0],
      });
    } catch {
      setError("Failed to load receipt");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (receiptNumber) load(); }, [receiptNumber]);

  const save = async () => {
    setSaving(true);
    try {
      // Only editable fields are sent — amount, payment_mode, bank_account,
      // customer, invoice are locked and excluded from this payload on purpose.
      await api.patch(`/receipts/${receiptNumber}`, {
        receipt_date: form.receipt_date,
        narration: form.narration || undefined,
        reference_number: form.payment_mode !== "cash" ? (form.reference_number || undefined) : undefined,
        cheque_number: form.payment_mode !== "cash" ? (form.cheque_number || undefined) : undefined,
        cheque_date: form.payment_mode !== "cash" ? (form.cheque_date || undefined) : undefined,
      });
      setEditing(false);
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to update receipt");
    } finally {
      setSaving(false);
    }
  };

  const cancelReceipt = async () => {
    if (!confirm(`Cancel receipt ${receipt.receipt_number}? This reverses its ledger entry and cannot be undone. You'll need to create a new receipt with correct details.`)) return;
    setCancelling(true);
    try {
      await api.post(`/receipts/${receiptNumber}/cancel`);
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to cancel receipt");
    } finally {
      setCancelling(false);
    }
  };

  const fmt = (n: any) => `AED ${parseFloat(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
  const inp = { width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };
  const inpReadonly = { ...inp, background: "#f8fafc", color: "#334155", cursor: "default" as const };
  const inpLocked = { ...inp, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" as const };
  const lbl = { fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 5 } as const;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading receipt...</div>;
  if (!receipt) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{error || "Receipt not found"}</div>;

  const isCancelled = receipt.status === "cancelled";

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => router.back()} style={{ fontSize: 13, color: "#475569", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        {!editing && !isCancelled && (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-outline" onClick={() => setEditing(true)}>Edit</button>
            <button
              onClick={cancelReceipt}
              disabled={cancelling}
              className="btn-outline"
              style={{ color: "#dc2626", borderColor: "#fecaca" }}
            >
              {cancelling ? "Cancelling..." : "Cancel Receipt"}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Receipt {receipt.receipt_number}
        </h1>
        {isCancelled && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b", background: "#fee2e2", padding: "3px 10px", borderRadius: 20 }}>
            CANCELLED
          </span>
        )}
      </div>

      {isCancelled && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#991b1b" }}>
          This receipt was cancelled. Its ledger entry has been reversed. If the payment was actually received, create a new receipt with the correct details.
        </div>
      )}

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>
          {editing ? "Edit Receipt Voucher" : "Receipt Voucher"}
        </h3>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 14 }}>
          <div style={{ width: 200 }}>
            <label style={lbl}>Payment Mode</label>
            <input style={inpLocked} disabled value={form.payment_mode.replace("_", " ").toUpperCase()} />
          </div>
          <div style={{ width: 200 }}>
            <label style={lbl}>Receipt Date</label>
            <input type="date" style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
              value={form.receipt_date} onChange={e => setForm({ ...form, receipt_date: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={lbl}>Customer</label>
            <input style={inpLocked} disabled value={form.customer_name} />
          </div>
          <div>
            <label style={lbl}>Against Invoice</label>
            <input style={inpLocked} disabled value={form.invoice_number || "—"} />
          </div>
          <div>
            <label style={lbl}>Amount AED</label>
            <input style={inpLocked} disabled value={form.amount} />
          </div>

          {form.payment_mode === "cash" ? (
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Narration</label>
              <input style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
                value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} placeholder="Payment description" />
            </div>
          ) : (
            <>
              <div>
                <label style={lbl}>Cheque Date</label>
                <input type="date" style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
                  value={form.cheque_date} onChange={e => setForm({ ...form, cheque_date: e.target.value })} />
              </div>
              <div>
                <label style={lbl}>Cheque No.</label>
                <input style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
                  value={form.cheque_number} onChange={e => setForm({ ...form, cheque_number: e.target.value })} placeholder="Cheque number" />
              </div>
              <div>
                <label style={lbl}>Received Into (Company Bank)</label>
                <input style={inpLocked} disabled value={form.bank_account} />
              </div>
              <div>
                <label style={lbl}>Customer Bank Name (Reference)</label>
                <input style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
                  value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} placeholder="e.g. Customer's bank" />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbl}>Narration</label>
                <input style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
                  value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} placeholder="Payment description (optional)" />
              </div>
            </>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 14 }}>
          Customer, amount, payment mode and bank account can't be changed after saving — cancel this receipt and create a new one if any of those were wrong.
        </p>

        {editing && (
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
            <button className="btn-outline" onClick={() => { setEditing(false); load(); }}>Cancel Edit</button>
          </div>
        )}
      </div>
    </div>
  );
}