"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: number;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("support");
  const [message, setMessage] = useState("");
  const [exportEmail, setExportEmail] = useState("");
  const [exportJson, setExportJson] = useState("");

  async function load() {
    const response = await fetch("/api/admin/users");
    if (response.status === 401) {
      router.replace("/admin/login");
      return;
    }
    if (response.status === 403) {
      setMessage("Owner role required to manage admin users.");
      return;
    }
    const result = await response.json();
    setUsers(result.users || []);
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/users");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (response.status === 403) {
        setMessage("Owner role required to manage admin users.");
        return;
      }
      const result = await response.json();
      setUsers(result.users || []);
    })();
  }, [router]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", email, password, role }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Admin user created." : result.error || "Failed.");
    if (response.ok) {
      setPassword("");
      await load();
    }
  }

  async function deactivate(id: number) {
    const reason = prompt("Deactivate reason") || "deactivated";
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deactivate", id, reason }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Admin deactivated." : result.error || "Failed.");
    if (response.ok) await load();
  }

  async function exportCustomer(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/admin/export?email=${encodeURIComponent(exportEmail)}`);
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Export failed.");
      return;
    }
    setExportJson(JSON.stringify(result, null, 2));
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Admin users & export</h1>
          <p>Role-based operators. Every privileged action is audit logged.</p>
        </div>
      </div>
      {message ? <p className="admin-muted">{message}</p> : null}
      <form className="admin-panel admin-form" onSubmit={createUser}>
        <h3>Create admin</h3>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="owner">owner</option>
            <option value="support">support</option>
            <option value="finance">finance</option>
            <option value="readonly">readonly</option>
          </select>
        </label>
        <button type="submit">Create</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Role</th><th>Active</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.role}</td>
                <td>{user.active ? "yes" : "no"}</td>
                <td>{user.createdAt}</td>
                <td>
                  {user.active ? (
                    <button className="admin-btn secondary" type="button" onClick={() => void deactivate(user.id)}>
                      Deactivate
                    </button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="admin-panel admin-form" onSubmit={exportCustomer}>
        <h3>Export customer admin record</h3>
        <p className="admin-muted">Payments, entitlements, usage metadata, claims — never file contents.</p>
        <label>Customer email<input value={exportEmail} onChange={(e) => setExportEmail(e.target.value)} required /></label>
        <button type="submit">Export JSON</button>
        {exportJson ? <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{exportJson}</pre> : null}
      </form>
    </>
  );
}
