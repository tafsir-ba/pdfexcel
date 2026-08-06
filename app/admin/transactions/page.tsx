"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tx = {
  id: number;
  createdAt: string;
  customerEmail: string | null;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  accessStartsAt: string | null;
  accessEndsAt: string | null;
  refundedAmountCents: number;
  providerSessionId: string | null;
};

export default function AdminTransactionsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Tx[]>([]);
  const [error, setError] = useState("");

  async function load(nextQ = q, nextStatus = status) {
    const params = new URLSearchParams();
    if (nextQ) params.set("q", nextQ);
    if (nextStatus) params.set("status", nextStatus);
    const response = await fetch(`/api/admin/transactions?${params}`);
    if (response.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "Failed to load.");
      return;
    }
    setRows(result.transactions);
  }

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/transactions");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Failed to load.");
        return;
      }
      setRows(result.transactions || []);
    })();
  }, [router]);

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Transactions</h1>
          <p>Search payments by email, Stripe session/payment id, or device id. File contents are never stored.</p>
        </div>
      </div>
      <div className="admin-toolbar">
        <input placeholder="Search email / payment / device" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="paid">paid</option>
          <option value="failed">failed</option>
          <option value="refunded">refunded</option>
          <option value="disputed">disputed</option>
        </select>
        <button type="button" onClick={() => void load()}>Filter</button>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th><th>Email</th><th>Amount</th><th>Status</th><th>Provider</th><th>Access</th><th>Refunded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><Link href={`/admin/transactions/${row.id}`}>{new Date(row.createdAt).toLocaleString()}</Link></td>
                <td>{row.customerEmail || "—"}</td>
                <td>{(row.amountCents / 100).toFixed(2)} {row.currency.toUpperCase()}</td>
                <td><span className={`badge ${row.status}`}>{row.status}</span></td>
                <td>{row.provider}</td>
                <td>{row.accessStartsAt ? `${new Date(row.accessStartsAt).toLocaleDateString()} → ${row.accessEndsAt ? new Date(row.accessEndsAt).toLocaleDateString() : "—"}` : "—"}</td>
                <td>{(row.refundedAmountCents / 100).toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={7}>No transactions yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
