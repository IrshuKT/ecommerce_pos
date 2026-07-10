"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import PageHeader from "@/components/admin/PageHeader";

interface Variant {
  id: number;
  sku: string;
  retail_price: number;
  stock_qty: number;
  product: { name: string; vat_rate: number; hsn_code: string };
}
interface Customer { id: number; name: string; phone: string; email: string }
interface CartLine {
  variant_id: number;
  product_name: string;
  sku: string;
  unit_price: number;
  quantity: number;
  discount_pct: number;
  vat_rate: number;
  stock_qty: number;
  taxable_amount: number;
  vat_amount: number;
  line_total: number;
}

const fmt = (n: number) => `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

function bankersRound(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff < 0.5) return floor;
  if (diff > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

function calcLine(line: CartLine): CartLine {
  const subtotal      = line.unit_price * line.quantity;
  const discount_amt  = r2(subtotal * line.discount_pct / 100);
  const taxable       = r2(subtotal - discount_amt);
  const vat_amount    = r2(taxable * line.vat_rate / 100);
  return { ...line, taxable_amount: taxable, vat_amount, line_total: r2(taxable + vat_amount) };
}

const inp: React.CSSProperties = { width: "100%", padding: "4px 6px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14 };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#64748b",marginBottom: 2, display: "block" };

export default function QuickCashSalePage() {
  const router = useRouter();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Variant[]>([]);
  const [showDrop, setShowDrop] = useState(false);

  const [customerMode, setCustomerMode] = useState<"walkin" | "account">("walkin");
  const [walkinName, setWalkinName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerLabel, setCustomerLabel] = useState("");
  const [showCustDrop, setShowCustDrop] = useState(false);

  const [paymentMode, setPaymentMode] = useState<"cash" | "bank_transfer">("cash");
  const [shippingCharge, setShippingCharge] = useState(0);
  const [receivedCash, setReceivedCash] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ invoice_number: string; receipt_number: string; grand_total: number } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const searchVariants = useCallback(async (q: string) => {
    setSearch(q);
    setShowDrop(true);
    if (q.length < 1) { setResults([]); return; }
    try {
      const r = await api.get(`/products/variants/search?q=${encodeURIComponent(q)}&limit=8`);
      setResults(Array.isArray(r.data) ? r.data : []);
    } catch { setResults([]); }
  }, []);

  const searchCustomers = useCallback(async (q: string) => {
    setCustomerSearch(q);
    setCustomerId(null);
    if (q.length < 1) { setCustomerResults([]); return; }
    try {
      const r = await api.get(`/users/?limit=50`);
      const data = Array.isArray(r.data) ? r.data : r.data?.items || [];
      const filtered = data.filter((u: any) =>
        u.role === "customer" &&
        (u.name?.toLowerCase().includes(q.toLowerCase()) || u.phone?.includes(q) || u.email?.toLowerCase().includes(q.toLowerCase()))
      );
      setCustomerResults(filtered.slice(0, 8));
      setShowCustDrop(true);
    } catch { setCustomerResults([]); }
  }, []);

  const addVariant = (v: Variant) => {
    setSearch(""); setResults([]); setShowDrop(false);
    searchInputRef.current?.focus();
    setCart(prev => {
      const existingIdx = prev.findIndex(l => l.variant_id === v.id);
      if (existingIdx >= 0) {
        const nl = [...prev];
        nl[existingIdx] = calcLine({ ...nl[existingIdx], quantity: nl[existingIdx].quantity + 1 });
        return nl;
      }
      return [...prev, calcLine({
        variant_id: v.id, product_name: v.product.name, sku: v.sku,
        unit_price: v.retail_price, quantity: 1, discount_pct: 0,
        vat_rate: v.product.vat_rate, stock_qty: v.stock_qty,
        taxable_amount: 0, vat_amount: 0, line_total: 0,
      })];
    });
  };

  const updateLine = (idx: number, field: "quantity" | "unit_price" | "discount_pct", value: number) => {
    const nl = [...cart];
    nl[idx] = calcLine({ ...nl[idx], [field]: value });
    setCart(nl);
  };

  const removeLine = (idx: number) => setCart(cart.filter((_, i) => i !== idx));

  const selectCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setCustomerLabel(`${c.name} — ${c.phone}`);
    setCustomerSearch("");
    setShowCustDrop(false);
  };

  const subtotal      = r2(cart.reduce((s, l) => s + l.unit_price * l.quantity, 0));
  const discountTotal = r2(cart.reduce((s, l) => s + (l.unit_price * l.quantity * l.discount_pct / 100), 0));
  const taxableTotal  = r2(cart.reduce((s, l) => s + l.taxable_amount, 0));
  const vatTotal       = r2(cart.reduce((s, l) => s + l.vat_amount, 0));

  const preRoundTotal = r2(taxableTotal + vatTotal + shippingCharge);
  const roundOff      = r2(bankersRound(preRoundTotal) - preRoundTotal);
  const grandTotal     = r2(preRoundTotal + roundOff);

  const receivedNum = parseFloat(receivedCash) || 0;
  const balance = r2(receivedNum - grandTotal); // positive = change to give, negative = still due

  const canSubmit = cart.length > 0 && (customerMode === "walkin" || customerId !== null) && !saving;

  const completeSale = async () => {
    setError(""); setSaving(true);
    try {
      const payload: any = {
        payment_mode: paymentMode,
        shipping_charge: shippingCharge,
        notes: notes || undefined,
        items: cart.map(l => ({
          variant_id: l.variant_id, quantity: l.quantity,
          unit_price: l.unit_price, discount_pct: l.discount_pct,
        })),
      };
      if (customerMode === "account" && customerId) payload.customer_id = customerId;
      if (customerMode === "walkin" && walkinName) payload.walkin_name = walkinName;

      const r = await api.post("/invoices/quick-sale", payload);
      setResult(r.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not complete sale.");
    } finally {
      setSaving(false);
    }
  };

  const startNewSale = () => {
    setCart([]); setWalkinName(""); setCustomerId(null); setCustomerLabel("");
    setShippingCharge(0); setReceivedCash(""); setNotes(""); setResult(null); setError("");
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  if (result) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: "60px auto", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>Sale Complete</h2>
        <p style={{ color: "#64748b", margin: "0 0 24px" }}>
          Invoice <strong>{result.invoice_number}</strong> paid in full — {fmt(result.grand_total)}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => router.push(`/admin/accounting/invoices/${result.invoice_number}`)}
            style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 14 }}
          >
            View / Print Receipt
          </button>
          <button
            onClick={startNewSale}
            style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#0284c7", color: "white", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >
            New Sale
          </button>
        </div>
      </div>
    );
  }

return (
  <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ flexShrink: 0, padding: "14px 14px 0" }}>
      <PageHeader title="Quick Cash Sale" />
    </div>

    {/* TOP BAR — customer selection + payment controls, same level, wraps if needed */}
    <div style={{
      flexShrink: 0, padding: "12px 24px 0",
      display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
    }}>
      {/* Customer mode */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={() => setCustomerMode("walkin")} style={{
          padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          border: customerMode === "walkin" ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
          background: customerMode === "walkin" ? "#eff6ff" : "white", color: customerMode === "walkin" ? "#0284c7" : "#64748b",
        }}>Walk-in / Cash</button>
        <button onClick={() => setCustomerMode("account")} style={{
          padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
          border: customerMode === "account" ? "1.5px solid #0284c7" : "1px solid #e2e8f0",
          background: customerMode === "account" ? "#eff6ff" : "white", color: customerMode === "account" ? "#0284c7" : "#64748b",
        }}>Registered Customer</button>
      </div>

      {customerMode === "walkin" ? (
        <input style={{ ...inp, maxWidth: 220 }} placeholder="Name for receipt (optional)" value={walkinName} onChange={e => setWalkinName(e.target.value)} />
      ) : (
        <div style={{ position: "relative", maxWidth: 240 }}>
          {customerId ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <span style={{ fontSize: 12 }}>{customerLabel}</span>
              <button onClick={() => { setCustomerId(null); setCustomerLabel(""); }} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer" }}>×</button>
            </div>
          ) : (
            <input style={inp} placeholder="Search customer…" value={customerSearch} onChange={e => searchCustomers(e.target.value)} onFocus={() => setShowCustDrop(true)} />
          )}
          {showCustDrop && customerResults.length > 0 && !customerId && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, zIndex: 20, maxHeight: 220, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", minWidth: 220 }}>
              {customerResults.map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "white"}>
                  {c.name} — {c.phone}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* divider */}
      <div style={{ width: 1, height: 28, background: "#e2e8f0", margin: "0 4px", flexShrink: 0 }} />

      {/* Payment mode */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {(["cash", "bank_transfer"] as const).map(mode => (
          <button key={mode} onClick={() => setPaymentMode(mode)} style={{
            padding: "8px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
            border: paymentMode === mode ? "1.5px solid #16a34a" : "1px solid #e2e8f0",
            background: paymentMode === mode ? "#f0fdf4" : "white", color: paymentMode === mode ? "#16a34a" : "#64748b",
          }}>
            {mode === "cash" ? "💵 Cash" : "💳 Card / Bank"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Shipping</span>
        <input type="number" step="0.01" style={{ ...inp, width: 90 }} value={shippingCharge} onChange={e => setShippingCharge(Number(e.target.value) || 0)} />
      </div>

      {paymentMode === "cash" && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#94a3b8" }}>Received Cash</span>
            <input type="number" step="0.01" style={{ ...inp, width: 110 }} placeholder="0.00" value={receivedCash} onChange={e => setReceivedCash(e.target.value)} />
          </div>

          <div style={{
            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
            padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 700,
            background: balance < 0 ? "#fef2f2" : "#f0fdf4",
            color: balance < 0 ? "#dc2626" : "#16a34a",
          }}>
            <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.8 }}>{balance < 0 ? "Balance Due" : "Change to Give"}</span>
            <span>{fmt(Math.abs(balance))}</span>
          </div>
        </>
      )}
    </div>

    {/* MAIN ROW: left = search+cart (scrolls), right = totals only (fixed) */}
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, padding: "16px 24px 24px", minHeight: 0 }}>
      {/* LEFT: search + cart */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ position: "relative", marginBottom: 12, flexShrink: 0 }}>
          <input
            ref={searchInputRef}
            style={inp}
            placeholder="Search product by name/SKU, or scan barcode…"
            value={search}
            onChange={e => searchVariants(e.target.value)}
            onFocus={() => setShowDrop(true)}
            onKeyDown={async e => {
              if (e.key === "Enter" && search.trim()) {
                e.preventDefault();
                const code = search.trim();
                try {
                  const r = await api.get(`/products/variants/by-barcode/${encodeURIComponent(code)}`);
                  addVariant(r.data);
                } catch {
                  if (results.length > 0) addVariant(results[0]);
                }
              }
            }}
          />
          {showDrop && results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "white", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 280, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
              {results.map(v => (
                <div
                  key={v.id}
                  onClick={() => addVariant(v)}
                  style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = "white"}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#1e293b" }}>{v.product.name}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{v.sku} · Stock: {v.stock_qty}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0284c7" }}>{fmt(v.retail_price)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ overflowY: "auto", flex: 1 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0, zIndex: 5 }}>
                  {["Product", "Qty", "Price", "Disc %", "VAT", "Total", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Search and add products above to start a sale</td></tr>
                )}
                {cart.map((line, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ fontWeight: 500, color: "#1e293b" }}>{line.product_name}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{line.sku}</div>
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <input type="number" min={1} max={line.stock_qty} value={line.quantity}
                        onChange={e => updateLine(idx, "quantity", Number(e.target.value) || 1)}
                        style={{ width: 60, padding: "5px 6px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }} />
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <input type="number" step="0.01" value={line.unit_price}
                        onChange={e => updateLine(idx, "unit_price", Number(e.target.value) || 0)}
                        style={{ width: 80, padding: "5px 6px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }} />
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <input type="number" step="0.01" value={line.discount_pct}
                        onChange={e => updateLine(idx, "discount_pct", Number(e.target.value) || 0)}
                        style={{ width: 60, padding: "5px 6px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }} />
                    </td>
                    <td style={{ padding: "8px 12px", color: "#64748b" }}>{line.vat_rate}%</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{fmt(line.line_total)}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <button onClick={() => removeLine(idx)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT: totals only, button padded inside the card border */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="card" style={{ padding: "16px 16px 20px", display: "flex", flexDirection: "column" }}>
          {[
            ["Subtotal", fmt(subtotal)],
            ["Discount", discountTotal > 0 ? `− ${fmt(discountTotal)}` : "—"],
            ["Taxable", fmt(taxableTotal)],
            ["VAT", fmt(vatTotal)],
            ...(shippingCharge > 0 ? [["Shipping", fmt(shippingCharge)]] : []),
            ...(roundOff !== 0 ? [["Round Off", `${roundOff > 0 ? "+" : "−"} ${fmt(Math.abs(roundOff))}`]] : []),
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, color: "#64748b" }}>
              <span>{label}</span><span>{value}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", marginTop: 6, borderTop: "1px solid #e2e8f0", fontSize: 17, fontWeight: 700, color: "#1e293b" }}>
            <span>Total</span><span>{fmt(grandTotal)}</span>
          </div>

          {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 10 }}>{error}</p>}

          <button
            onClick={completeSale}
            disabled={!canSubmit}
            style={{
              width: "100%", marginTop: 16, padding: "12px", borderRadius: 8, border: "none",
              background: canSubmit ? "#16a34a" : "#cbd5e1", color: "white", fontSize: 15, fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Processing…" : `Complete Sale — ${fmt(grandTotal)}`}
          </button>
        </div>
      </div>
    </div>
  </div>
);
}