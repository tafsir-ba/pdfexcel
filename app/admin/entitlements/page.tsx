"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Ent = {
  id: number;
  email: string | null;
  deviceId: string | null;
  source: string;
  status: string;
  computedStatus?: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

export default function AdminEntitlementsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Ent[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/entitlements");
    if (response.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const result = await response.json();
    setRows(result.entitlements || []);
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/entitlements");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const result = await response.json();
      setRows(result.entitlements || []);
    })();
  }, [router]);

  async function grant(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant", deviceId, email, days, reason }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Access granted." : result.error || "Failed.");
    if (response.ok) {
      setReason("");
      await load();
    }
  }

  async function act(id: number, action: "revoke" | "extend") {
    const nextReason = prompt("Reason (required)") || "";
    if (!nextReason.trim()) return;
    const response = await fetch("/api/admin/entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, entitlementId: id, days: 30, reason: nextReason }),
    });
    const result = await response.json();
    setMessage(response.ok ? `Entitlement ${action}d.` : result.error || "Failed.");
    if (response.ok) await load();
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Entitlements / Access</h1>
          <p>Who has paid access and when it expires. Manual changes require a reason and are audit logged.</p>
        </div>
      </div>
      <form className="admin-panel admin-form" onSubmit={grant}>
        <h3>Manually grant access</h3>
        <label>Device id<input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} /></label>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Days<input type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
        <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} required /></label>
        <button type="submit">Grant</button>
        {message ? <p className="admin-muted">{message}</p> : null}
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>ID</th><th>Email</th><th>Device</th><th>Source</th><th>Status</th><th>Window</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.email || "—"}</td>
                <td>{row.deviceId || "—"}</td>
                <td>{row.source}</td>
                <td><span className={`badge ${row.computedStatus || row.status}`}>{row.computedStatus || row.status}</span></td>
                <td>{new Date(row.startsAt).toLocaleDateString()} → {new Date(row.endsAt).toLocaleDateString()}</td>
                <td>
                  <button className="admin-btn secondary" type="button" onClick={() => void act(row.id, "extend")}>Extend</button>{" "}
                  <button className="admin-btn secondary" type="button" onClick={() => void act(row.id, "revoke")}>Revoke</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7}>No entitlements yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
