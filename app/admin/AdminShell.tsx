"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState, useSyncExternalStore } from "react";

const NAV = [
  { href: "/admin", label: "Dashboard", permission: "dashboard:read" },
  { href: "/admin/transactions", label: "Transactions", permission: "transactions:read" },
  { href: "/admin/entitlements", label: "Entitlements", permission: "entitlements:read" },
  { href: "/admin/pricing", label: "Pricing", permission: "pricing:read" },
  { href: "/admin/usage", label: "Usage metadata", permission: "usage:read" },
  { href: "/admin/claims", label: "Claims", permission: "claims:read" },
  { href: "/admin/users", label: "Admin users", permission: "owner" },
];

function readAdminEmail() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("adminEmail") || "";
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const email = useSyncExternalStore(() => () => {}, readAdminEmail, () => "");
  const [role, setRole] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    if (pathname === "/admin/login") return;
    void (async () => {
      const response = await fetch("/api/admin/me");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) return;
      const result = (await response.json()) as { email?: string; role?: string; permissions?: string[] };
      if (result.email) sessionStorage.setItem("adminEmail", result.email);
      setRole(result.role || "");
      setPermissions(result.permissions || []);
    })();
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    sessionStorage.removeItem("adminEmail");
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") return <>{children}</>;

  const visibleNav = NAV.filter((item) => {
    if (item.permission === "owner") return role === "owner" || permissions.includes("*");
    return permissions.includes("*") || permissions.includes(item.permission);
  });

  return (
    <div className="admin-app">
      <aside className="admin-nav">
        <div className="admin-brand">
          <strong>PDF Mail Merge</strong>
          <span>Admin · observability</span>
        </div>
        <p className="admin-privacy">File contents are never stored.</p>
        <nav>
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-nav-foot">
          <span>{email || "Signed in"}{role ? ` · ${role}` : ""}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
