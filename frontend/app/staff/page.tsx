"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import PageHeader from "@/components/admin/PageHeader";

interface StaffUser {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "manager" | "sales_staff";
  is_active: boolean;
}

const STAFF_ROLES = ["admin", "manager", "sales_staff"];

const roleBadge: Record<string, { label: string; bg: string; color: string }> = {
  admin:       { label: "Admin",       bg: "#eff6ff", color: "#0284c7" },
  manager:     { label: "Manager",     bg: "#f0fdf4", color: "#16a34a" },
  sales_staff: { label: "Sales Staff", bg: "#fefce8", color: "#a16207" },
};

const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" };
const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#475569", marginBottom: 5 };

// FastAPI/Pydantic 422 errors return detail as an array of {type, loc, msg, input} objects,
// not a string — this safely extracts a readable message from any shape.
function extractErrorMessage(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: any) => {
        if (typeof d === "string") return d;
        const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : "";
        return field ? `${field}: ${d.msg}` : d.msg || JSON.stringify(d);
      })
      .join("; ");
  }
  if (typeof detail === "object") return detail.msg || JSON.stringify(detail);
  return fallback;
}

export default function StaffUsersPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Guard: only admin/manager/sales_staff may land here. Everyone else gets bounced.
  useEffect(() => {
    if (user && !STAFF_ROLES.includes(user.role)) {
      router.replace("/shop");
    }
  }, [user, router]);

  const canManage = user?.role === "admin"; // create/edit/delete stay admin-only

  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<StaffUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/users/staff");
      setStaff(r.data || []);
    } catch (e: any) {
      setError(extractErrorMessage(e, "Failed to load staff users"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (user && !STAFF_ROLES.includes(user.role)) return null; // avoid flashing content mid-redirect

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <PageHeader
        title="Staff Users"
        subtitle="Manage admin, manager, and sales staff accounts"
        action={
          canManage ? (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              + Add Staff User
            </button>
          ) : undefined
        }
      />

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: "#fef2f2", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Name", "Email", "Phone", "Role", "Status", canManage ? "" : null].filter((h) => h !== null).map((h) => (
                <th key={h as string} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
            )}
            {!loading && staff.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No staff users yet — add one above.</td></tr>
            )}
            {staff.map(u => {
              const badge = roleBadge[u.role] || { label: u.role, bg: "#f1f5f9", color: "#64748b" };
              return (
                <tr key={u.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 500, color: "#1e293b" }}>{u.name}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b" }}>{u.email}</td>
                  <td style={{ padding: "10px 14px", color: "#64748b" }}>{u.phone}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.color }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: u.is_active ? "#f0fdf4" : "#fef2f2", color: u.is_active ? "#16a34a" : "#dc2626" }}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditUser(u)} style={{ border: "none", background: "none", color: "#0284c7", cursor: "pointer", fontSize: 13, marginRight: 12 }}>
                        Edit
                      </button>
                      <button onClick={() => setDeleteUser(u)} style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: 13 }}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canManage && showCreate && (
        <StaffModal
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}

      {canManage && editUser && (
        <StaffModal
          mode="edit"
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load(); }}
        />
      )}

      {canManage && deleteUser && (
        <DeleteConfirm
          user={deleteUser}
          onClose={() => setDeleteUser(null)}
          onDeleted={() => { setDeleteUser(null); load(); }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE / EDIT MODAL
// ══════════════════════════════════════════════════════════════════════════════

function StaffModal({ mode, user, onClose, onSaved }: {
  mode: "create" | "edit";
  user?: StaffUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [role, setRole] = useState<string>(user?.role || "sales_staff");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setError("");
    if (!name.trim() || !phone.trim() || (mode === "create" && !email.trim())) {
      setError("Name, phone" + (mode === "create" ? ", email" : "") + " are required");
      return;
    }
    if (mode === "create" && (!password || password.length < 8)) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (mode === "edit" && password && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        await api.post("/users/staff", { name, email, phone, password, role });
      } else if (user) {
        const payload: any = { name, phone, role, is_active: isActive };
        if (password) payload.password = password;
        await api.patch(`/users/staff/${user.id}`, payload);
      }
      onSaved();
    } catch (e: any) {
      setError(extractErrorMessage(e, "Failed to save staff user"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div className="card" style={{ padding: 24, width: 420, maxWidth: "90vw" }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 18px", color: "#1e293b" }}>
          {mode === "create" ? "Add Staff User" : `Edit ${user?.name}`}
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={lbl}>Full Name *</label>
            <input style={inp} value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div>
            <label style={lbl}>Email {mode === "create" ? "*" : ""}</label>
            <input
              style={{ ...inp, background: mode === "edit" ? "#f8fafc" : "white" }}
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={mode === "edit"}
              placeholder="staff@example.com"
            />
            {mode === "edit" && <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>Email cannot be changed after creation</p>}
          </div>

          <div>
            <label style={lbl}>Phone *</label>
            <input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="050 123 4567" />
          </div>

          <div>
            <label style={lbl}>Role *</label>
            <select style={inp} value={role} onChange={e => setRole(e.target.value)}>
              <option value="admin">Admin — full access</option>
              <option value="manager">Manager — products, inventory, accounting, reports</option>
              <option value="sales_staff">Sales Staff — POS / billing only</option>
            </select>
          </div>

          <div>
            <label style={lbl}>{mode === "create" ? "Password *" : "Reset Password (optional)"}</label>
            <input
              type="password" style={inp} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "create" ? "Min. 8 characters" : "Leave blank to keep current password"}
            />
          </div>

          {mode === "edit" && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="staffActive" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
              <label htmlFor="staffActive" style={{ fontSize: 14, color: "#475569", cursor: "pointer" }}>Account active</label>
            </div>
          )}

          {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
          <button className="btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create User" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE CONFIRM
// ══════════════════════════════════════════════════════════════════════════════

function DeleteConfirm({ user, onClose, onDeleted }: {
  user: StaffUser;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const confirmDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/users/staff/${user.id}`);
      onDeleted();
    } catch (e: any) {
      setError(extractErrorMessage(e, "Failed to delete user"));
      setDeleting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div className="card" style={{ padding: 24, width: 380, maxWidth: "90vw" }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 8px", color: "#1e293b" }}>Delete Staff User</h2>
        <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 16px" }}>
          Are you sure you want to delete <strong>{user.name}</strong> ({user.email})? This cannot be undone.
        </p>
        {error && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn-outline" onClick={onClose} disabled={deleting}>Cancel</button>
          <button
            onClick={confirmDelete}
            disabled={deleting}
            style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#dc2626", color: "white", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}