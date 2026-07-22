"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";

export default function PaymentVoucherDetailPage() {
  const { paymentNumber: raw } = useParams();
  const paymentNumber = decodeURIComponent(raw as string);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [payment, setPayment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(searchParams.get("edit") === "true");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [form, setForm] = useState({
    vendor_name: "", purchase_number: "", amount: "",
    payment_mode: "cash",
    reference_number: "",
    bank_account: "",
    cheque_number: "",
    cheque_date: "",
    narration: "", payment_date: new Date().toISOString().split("T")[0],
  });

  const load = async () => {
    setLoading(true);
    try {
      const p = (await api.get(`/payment-vouchers/${paymentNumber}`)).data;
      setPayment(p);
      setForm({
        vendor_name: p.vendor_name || `#${p.vendor_id}`,
        purchase_number: p.purchase_number || "",
        amount: p.amount != null ? String(p.amount) : "",
        payment_mode: p.payment_mode || "cash",
        reference_number: p.reference_number || "",
        bank_account: p.bank_account || "",
        cheque_number: p.cheque_number || "",
        cheque_date: p.cheque_date || "",
        narration: p.narration || "",
        payment_date: p.payment_date ? String(p.payment_date).split("T")[0] : new Date().toISOString().split("T")[0],
      });
    } catch {
      setError("Failed to load payment voucher");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (paymentNumber) load(); }, [paymentNumber]);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/payment-vouchers/${paymentNumber}`, {
        payment_date: form.payment_date,
        narration: form.narration || undefined,
        reference_number: form.payment_mode !== "cash" ? (form.reference_number || undefined) : undefined,
        cheque_number: form.payment_mode !== "cash" ? (form.cheque_number || undefined) : undefined,
        cheque_date: form.payment_mode !== "cash" ? (form.cheque_date || undefined) : undefined,
      });
      setEditing(false);
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to update payment voucher");
    } finally {
      setSaving(false);
    }
  };

  const cancelPayment = async () => {
    if (!confirm(`Cancel payment ${payment.payment_number}? This reverses its ledger entry and cannot be undone. You'll need to create a new payment with correct details.`)) return;
    setCancelling(true);
    try {
      await api.post(`/payment-vouchers/${paymentNumber}/cancel`);
      load();
    } catch (e: any) {
      alert(e.response?.data?.detail || "Failed to cancel payment voucher");
    } finally {
      setCancelling(false);
    }
  };

  const fmt = (n: any) => `AED ${parseFloat(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
  const inp = { width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const };
  const inpReadonly = { ...inp, background: "#f8fafc", color: "#334155", cursor: "default" as const };
  const inpLocked = { ...inp, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" as const };
  const lbl = { fontSize: 13, fontWeight: 500, color: "#475569", display: "block", marginBottom: 5 } as const;

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading payment...</div>;
  if (!payment) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>{error || "Payment voucher not found"}</div>;

  const isCancelled = payment.status === "cancelled";

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button onClick={() => router.back()} style={{ fontSize: 13, color: "#475569", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        {!editing && !isCancelled && (
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-outline" onClick={() => setEditing(true)}>Edit</button>
            <button
              onClick={cancelPayment}
              disabled={cancelling}
              className="btn-outline"
              style={{ color: "#dc2626", borderColor: "#fecaca" }}
            >
              {cancelling ? "Cancelling..." : "Cancel Payment"}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>
          Payment {payment.payment_number}
        </h1>
        {isCancelled && (
          <span style={{ fontSize: 12, fontWeight: 600, color: "#991b1b", background: "#fee2e2", padding: "3px 10px", borderRadius: 20 }}>
            CANCELLED
          </span>
        )}
      </div>

      {isCancelled && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#991b1b" }}>
          This payment voucher was cancelled. Its ledger entry has been reversed. If the payment was actually made, create a new payment voucher with the correct details.
        </div>
      )}

      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 16px" }}>
          {editing ? "Edit Payment Voucher" : "Payment Voucher"}
        </h3>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 14 }}>
          <div style={{ width: 200 }}>
            <label style={lbl}>Payment Mode</label>
            <input style={inpLocked} disabled value={form.payment_mode.replace("_", " ").toUpperCase()} />
          </div>
          <div style={{ width: 200 }}>
            <label style={lbl}>Payment Date</label>
            <input type="date" style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
              value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={lbl}>Vendor</label>
            <input style={inpLocked} disabled value={form.vendor_name} />
          </div>
          <div>
            <label style={lbl}>Against Purchase</label>
            <input style={inpLocked} disabled value={form.purchase_number || "—"} />
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
                <label style={lbl}>Paid From (Company Bank)</label>
                <input style={inpLocked} disabled value={form.bank_account} />
              </div>
              <div>
                <label style={lbl}>Reference</label>
                <input style={editing ? inp : inpReadonly} disabled={!editing || isCancelled}
                  value={form.reference_number} onChange={e => setForm({ ...form, reference_number: e.target.value })} placeholder="Reference" />
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
          Vendor, amount, payment mode and bank account can't be changed after saving — cancel this payment and create a new one if any of those were wrong.
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