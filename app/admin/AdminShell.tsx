"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useSyncExternalStore } from "react";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/entitlements", label: "Entitlements" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/usage", label: "Usage metadata" },
  { href: "/admin/claims", label: "Claims" },
  { href: "/admin/users", label: "Admin users" },
];

function readAdminEmail() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("adminEmail") || "";
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const email = useSyncExternalStore(() => () => {}, readAdminEmail, () => "");

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    sessionStorage.removeItem("adminEmail");
    router.push("/admin/login");
  }

  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <div className="admin-app">
      <aside className="admin-nav">
        <div className="admin-brand">
          <strong>PDF Mail Merge</strong>
          <span>Admin · observability</span>
        </div>
        <p className="admin-privacy">File contents are never stored.</p>
        <nav>
          {NAV.map((item) => (
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
          <span>{email || "Signed in"}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="admin-main">{children}</div>
    </div>
  );
}
