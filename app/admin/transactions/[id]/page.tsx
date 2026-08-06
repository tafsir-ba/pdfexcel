"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AdminTransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/admin/transactions/${params.id}`);
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Failed to load.");
        return;
      }
      setData(result);
    })();
  }, [params.id, router]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!data) return <p className="admin-muted">Loading…</p>;
  const tx = data.transaction;

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Transaction #{tx.id}</h1>
          <p>{data.privacyNote}</p>
        </div>
      </div>
      <div className="admin-panel">
        <p><strong>Email:</strong> {tx.customerEmail || "—"}</p>
        <p><strong>Device:</strong> {tx.deviceId || "—"}</p>
        <p><strong>Session:</strong> {tx.providerSessionId || "—"}</p>
        <p><strong>Payment:</strong> {tx.providerPaymentId || "—"}</p>
        <p><strong>Status:</strong> <span className={`badge ${tx.status}`}>{tx.status}</span></p>
        <p><strong>Amount:</strong> {(tx.amountCents / 100).toFixed(2)} {tx.currency}</p>
        <p><strong>Access window:</strong> {tx.accessStartsAt || "—"} → {tx.accessEndsAt || "—"}</p>
      </div>
      <div className="admin-panel">
        <h3>Entitlement changes</h3>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(data.entitlements, null, 2)}</pre>
      </div>
      <div className="admin-panel">
        <h3>Webhook matches</h3>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(data.webhooks, null, 2)}</pre>
      </div>
      <div className="admin-panel">
        <h3>Claim notes</h3>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(data.notes, null, 2)}</pre>
      </div>
    </>
  );
}
