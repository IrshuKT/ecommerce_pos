"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useRouter } from "next/navigation";
import { useSettings } from "@/app/context/SettingsContext";
import { useState, useEffect, Suspense } from "react";

interface SubNavItem { label: string; href: string; icon: string }
interface NavItem { label: string; href: string; icon: string; expandable?: boolean; subItems?: SubNavItem[]; roles?: string[] }

const accountingItems: SubNavItem[] = [
  
  { label: "Sales Invoices",    href: "/admin/accounting/invoices",         icon: "🧾" },
  { label: "Sales Returns",     href: "/admin/accounting/returns",          icon: "↩️" },
  { label: "Purchases",  href: "/admin/purchases",  icon: "🛒" },
  { label: "Purchase Returns",  href: "/admin/accounting/purchases/return", icon: "↪️" },
  { label: "Receipt Vouchers",  href: "/admin/accounting/receipts",         icon: "💰" },
  { label: "Payment Vouchers",  href: "/admin/accounting/payments",         icon: "💸" },
  { label: "Journal Entries",   href: "/admin/accounting/journal",          icon: "📒" },
  { label: "Chart of Accounts", href: "/admin/accounting/ChartOfAccounts",  icon: "📊" },
  { label: "Statements",        href: "/admin/accounting/statement",        icon: "📋" },
  { label: "Opening Balances",  href: "/admin/accounting/opening-balances", icon: "⚖️" },
];

const reportsItems: SubNavItem[] = [
  { label: "Profit & Loss",       href: "/admin/reports?tab=pl",         icon: "📈" },
  { label: "Trial Balance",       href: "/admin/reports?tab=tb",         icon: "⚖️" },
  { label: "Balance Sheet",       href: "/admin/reports?tab=bs",         icon: "📄" },
  { label: "Cash Book",           href: "/admin/reports?tab=cashbook",   icon: "💵" },
  { label: "Day Book",            href: "/admin/reports?tab=daybook",    icon: "📅" },
  { label: "Ledger",              href: "/admin/reports?tab=ledger",     icon: "📒" },
  { label: "Stock Report",        href: "/admin/reports?tab=stock",      icon: "📦" },
  { label: "Stock Valuation",     href: "/admin/reports?tab=stockvalue", icon: "💎" },
  { label: "VAT Sales Register",  href: "/admin/reports?tab=vatsales",   icon: "🧾" },
  { label: "VAT Return",          href: "/admin/reports?tab=vatreturn",  icon: "📑" },
];

const nav: NavItem[] = [
  { label: "Dashboard",  href: "/admin",           icon: "▦" }, // all roles
  { label: "Quick Cash Sale", href: "/admin/accounting/invoices/quick-sale", icon: "🛍️", roles: ["admin", "manager", "sales_staff"] },
  { label: "Products",   href: "/admin/products",   icon: "🪟", roles: ["admin", "manager"] },
  { label: "Orders",     href: "/admin/orders",     icon: "📦", roles: ["admin", "manager", "sales_staff"] },
  { label: "Customers",  href: "/admin/customers",  icon: "👥", roles: ["admin", "manager", "sales_staff"] },
  { label: "Vendors",    href: "/admin/vendors",     icon: "🏭", roles: ["admin", "manager"] },
  { label: "Accounting", href: "/admin/accounting", icon: "🧾", expandable: true, subItems: accountingItems, roles: ["admin", "manager"] },
  { label: "Reports",    href: "/admin/reports",    icon: "📊", expandable: true, subItems: reportsItems, roles: ["admin", "manager"] },
  { label: "Coupons",    href: "/admin/coupons",    icon: "🏷️", roles: ["admin", "manager"] },
  { label: "Users", href: "/staff", icon: "🧑‍💼", roles: ["admin", "manager", "sales_staff"] },
  { label: "Settings",   href: "/admin/settings",   icon: "⚙️", roles: ["admin"] },
];

export default function AdminSidebar() {
  return (
    <Suspense fallback={<aside style={{ width: 240, height: "100vh", background: "white", borderRight: "1px solid #e2e8f0" }} />}>
      <AdminSidebarInner />
    </Suspense>
  );
}

function AdminSidebarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout } = useAuthStore();   // hook called correctly, inside component
  const router = useRouter();
  const settings = useSettings();

  const visibleNav = nav.filter(item => !item.roles || item.roles.includes(user?.role || ""));

  const isAccountingActive = pathname.startsWith("/admin/accounting");
  const isReportsActive = pathname.startsWith("/admin/reports");

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "/admin/accounting": isAccountingActive,
    "/admin/reports": isReportsActive,
  });

  useEffect(() => {
    if (isAccountingActive) setOpenMenus((m) => ({ ...m, "/admin/accounting": true }));
  }, [isAccountingActive]);

  useEffect(() => {
    if (isReportsActive) setOpenMenus((m) => ({ ...m, "/admin/reports": true }));
  }, [isReportsActive]);

  const handleLogout = () => { logout(); router.replace("/login"); };
  const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") || "http://localhost:8000";

  const roleLabel: Record<string, string> = {
    admin: "Administrator",
    manager: "Manager",
    sales_staff: "Sales Staff",
    customer: "Customer",
  };

  return (
    <aside style={{
      width: 240, background: "white", borderRight: "1px solid #e2e8f0",
      display: "flex", flexDirection: "column", height: "100vh",
      position: "sticky", top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 7, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            {settings.logo_url
              ? <img src={`${API_BASE}${settings.logo_url}`} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              : <div style={{ width: 30, height: 30, borderRadius: 7, background: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                    <rect x="2" y="2" width="6" height="6" rx="1" fill="white" opacity="0.9"/>
                    <rect x="10" y="2" width="6" height="6" rx="1" fill="white" opacity="0.6"/>
                    <rect x="2" y="10" width="6" height="6" rx="1" fill="white" opacity="0.6"/>
                    <rect x="10" y="10" width="6" height="6" rx="1" fill="white" opacity="0.9"/>
                  </svg>
                </div>
            }
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>
              {settings.company_name || "Admin Panel"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Admin Panel</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px", overflowY: "auto" }}>
        {visibleNav.map((item) => {
          const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));

          if (item.expandable) {
            const isOpen = !!openMenus[item.href];
            return (
              <div key={item.href}>
                <div
                  onClick={() => setOpenMenus((m) => ({ ...m, [item.href]: !m[item.href] }))}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px", borderRadius: 8, marginBottom: 2,
                    fontSize: 14, fontWeight: active ? 500 : 400,
                    color: active ? "#0284c7" : "#475569",
                    background: active ? "#eff6ff" : "transparent",
                    cursor: "pointer", transition: "all 0.15s",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                    {item.label}
                  </div>
                  <span style={{
                    fontSize: 10, color: "#94a3b8",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                    display: "inline-block",
                  }}>▼</span>
                </div>

                {isOpen && (
                  <div style={{
                    marginLeft: 12,
                    borderLeft: "2px solid #e2e8f0",
                    paddingLeft: 8,
                    marginBottom: 4,
                    overflow: "hidden",
                  }}>
                    {item.subItems?.map((sub) => {
                      const [subPath, subQuery] = sub.href.split("?");
                      const subActive = subQuery
                        ? pathname === subPath && searchParams.get("tab") === new URLSearchParams(subQuery).get("tab")
                        : pathname.startsWith(sub.href);
                      return (
                        <Link key={sub.href} href={sub.href} style={{ textDecoration: "none" }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "7px 10px", borderRadius: 6, marginBottom: 1,
                            fontSize: 13,
                            fontWeight: subActive ? 600 : 400,
                            color: subActive ? "#0284c7" : "#64748b",
                            background: subActive ? "#eff6ff" : "transparent",
                            transition: "all 0.1s",
                            borderLeft: subActive ? "2px solid #0284c7" : "2px solid transparent",
                          }}
                            onMouseEnter={(e) => { if (!subActive) e.currentTarget.style.background = "#f8fafc"; }}
                            onMouseLeave={(e) => { if (!subActive) e.currentTarget.style.background = "transparent"; }}
                          >
                            <span style={{ fontSize: 13 }}>{sub.icon}</span>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {sub.label}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link key={item.href} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 8, marginBottom: 2,
              fontSize: 14, fontWeight: active ? 500 : 400,
              color: active ? "#0284c7" : "#475569",
              background: active ? "#eff6ff" : "transparent",
              textDecoration: "none", transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 13, fontWeight: 600 }}>
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#1e293b" }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{roleLabel[user?.role || ""] || user?.role}</div>
          </div>
        </div>
        <button onClick={handleLogout} style={{
          width: "100%", padding: "8px", borderRadius: 7, border: "1px solid #e2e8f0",
          background: "white", color: "#64748b", fontSize: 13, cursor: "pointer",
          transition: "all 0.15s",
        }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}