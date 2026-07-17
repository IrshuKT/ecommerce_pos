"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import PageHeader from "@/components/admin/PageHeader";
import DataTable from "@/components/admin/DataTable";

function AddCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: any) => void }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [createdInfo, setCreatedInfo] = useState<{ email: string; password: string } | null>(null);

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.phone) {
      setError("Name, email, and phone are all required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password || undefined, // omit entirely to let backend auto-generate
      };
      const res = await api.post("/users/", payload);
      onCreated(res.data);
      if (res.data.generated_password) {
        // Show the auto-generated password once before closing, so it can be copied down
        setCreatedInfo({ email: res.data.email, password: res.data.generated_password });
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create customer");
    } finally {
      setSaving(false);
    }
  };

  if (createdInfo) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: 24, width: 420, maxWidth: "90vw" }}>
          <h3 style={{ marginTop: 0 }}>Customer Created</h3>
          <p style={{ fontSize: 14, color: "#475569" }}>
            Share these credentials with the customer — the password won't be shown again.
          </p>
          <div style={{ background: "#f1f5f9", padding: 12, borderRadius: 4, fontSize: 14, fontFamily: "monospace" }}>
            <div>Email: {createdInfo.email}</div>
            <div>Password: {createdInfo.password}</div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 8, padding: 24, width: 420, maxWidth: "90vw" }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Add Customer</h3>

        {error && (
          <div style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 13, color: "#475569" }}>
            Name *
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 13, color: "#475569" }}>
            Email *
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 13, color: "#475569" }}>
            Phone
            <input
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 13, color: "#475569" }}>
            Password
            <input
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Leave blank to auto-generate"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Create Customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", marginTop: 4, padding: "8px 10px",
  border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 14, boxSizing: "border-box",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadCustomers = () => {
    setLoading(true);
    api.get("/users/").then(r => setCustomers(Array.isArray(r.data) ? r.data : [])).catch(() => setCustomers([])).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleCreated = (newCustomer: any) => {
    setCustomers(prev => [newCustomer, ...prev]);
  };

  const columns = [
    { key: "id", label: "ID", width: 60 },
    { key: "name", label: "Name", render: (r: any) => (
  <a href={`/admin/customers/${r.id}`} style={{ fontWeight: 500, color: "#0284c7", textDecoration: "none" }}>
    {r.name}
  </a>
)},
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "role", label: "Role", render: (r: any) => <span style={{ textTransform: "capitalize", fontSize: 12, background: r.role === "admin" ? "#ede9fe" : "#f1f5f9", color: r.role === "admin" ? "#7c3aed" : "#475569", padding: "2px 8px", borderRadius: 4 }}>{r.role}</span> },
    { key: "is_active", label: "Status", render: (r: any) => <span style={{ fontSize: 12, color: r.is_active ? "#16a34a" : "#dc2626" }}>{r.is_active ? "Active" : "Inactive"}</span> },
    { key: "created_at", label: "Joined", render: (r: any) => new Date(r.created_at).toLocaleDateString("en-AE") },
  ];

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <PageHeader title="Customers" subtitle="View registered customers" />
        <button type="button" className="btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Customer
        </button>
      </div>
      <div className="card">
        <DataTable columns={columns} data={customers} loading={loading} emptyText="No customers yet" />
      </div>

      {showAddModal && (
        <AddCustomerModal onClose={() => setShowAddModal(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}