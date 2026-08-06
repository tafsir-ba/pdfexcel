"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type EventRow = {
  id: number;
  createdAt: string;
  deviceId: string | null;
  eventType: string;
  rowsProcessed: number;
  pdfsGenerated: number;
  templateFilenameSanitized: string | null;
  csvFilenameSanitized: string | null;
  zipFilenameSanitized: string | null;
  success: boolean;
};

export default function AdminUsagePage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<EventRow[]>([]);

  async function load(nextQ = q) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    const response = await fetch(`/api/admin/usage?${params}`);
    if (response.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const result = await response.json();
    setRows(result.events || []);
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/usage");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const result = await response.json();
      setRows(result.events || []);
    })();
  }, [router]);

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Usage / generation metadata</h1>
          <p><strong>Admin views never show file contents.</strong> Only counts, hashes, and sanitized filenames.</p>
        </div>
      </div>
      <div className="admin-toolbar">
        <input placeholder="Search device or filename" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => void load()}>Filter</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th><th>Device</th><th>Type</th><th>Rows</th><th>PDFs</th><th>Template</th><th>CSV</th><th>ZIP</th><th>OK</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.deviceId || "—"}</td>
                <td>{row.eventType}</td>
                <td>{row.rowsProcessed}</td>
                <td>{row.pdfsGenerated}</td>
                <td>{row.templateFilenameSanitized || "—"}</td>
                <td>{row.csvFilenameSanitized || "—"}</td>
                <td>{row.zipFilenameSanitized || "—"}</td>
                <td>{row.success ? "yes" : "no"}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={9}>No generation events yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
