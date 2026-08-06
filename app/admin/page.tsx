"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Dashboard = {
  privacyNote: string;
  revenueCents: number;
  successfulPayments: number;
  failedPayments: number;
  refunds: number;
  activePaidUsers: number;
  expiredUsers: number;
  freeUsageVolume: number;
  generationVolume: number;
  recentClaims: Array<{ id: number; subject: string; status: string; customerEmail?: string | null }>;
  recentAudit: Array<{ id: number; actionType: string; targetType: string; createdAt: string; reason?: string | null }>;
  recentWebhooks: Array<{ id: number; eventType: string; processed: boolean; createdAt: string }>;
  livePricing: Array<{ name: string; amountCents: number; durationDays: number; freeGenerationLimit: number }>;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/dashboard");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Failed to load dashboard.");
        return;
      }
      setData(result);
    })();
  }, [router]);

  if (error) return <p className="admin-error">{error}</p>;
  if (!data) return <p className="admin-muted">Loading dashboard…</p>;

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Dashboard</h1>
          <p>{data.privacyNote}</p>
        </div>
      </div>
      <div className="admin-grid">
        <div className="admin-stat"><span>Revenue</span><strong>{money(data.revenueCents)}</strong></div>
        <div className="admin-stat"><span>Successful payments</span><strong>{data.successfulPayments}</strong></div>
        <div className="admin-stat"><span>Failed payments</span><strong>{data.failedPayments}</strong></div>
        <div className="admin-stat"><span>Refunds / disputes</span><strong>{data.refunds}</strong></div>
        <div className="admin-stat"><span>Active paid</span><strong>{data.activePaidUsers}</strong></div>
        <div className="admin-stat"><span>Expired</span><strong>{data.expiredUsers}</strong></div>
        <div className="admin-stat"><span>Free usage (30d)</span><strong>{data.freeUsageVolume}</strong></div>
        <div className="admin-stat"><span>PDFs generated (30d)</span><strong>{data.generationVolume}</strong></div>
      </div>
      <div className="admin-panel">
        <h3>Live pricing</h3>
        {data.livePricing.length === 0 ? <p className="admin-muted">No active plans.</p> : (
          <ul>
            {data.livePricing.map((plan) => (
              <li key={plan.name}>
                {plan.name} · {money(plan.amountCents)} · {plan.durationDays} days · free first {plan.freeGenerationLimit}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="admin-panel">
        <h3>Recent claims / support</h3>
        {data.recentClaims.length === 0 ? <p className="admin-muted">No claims yet.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>ID</th><th>Subject</th><th>Email</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentClaims.map((claim) => (
                  <tr key={claim.id}>
                    <td><Link href={`/admin/claims?id=${claim.id}`}>{claim.id}</Link></td>
                    <td>{claim.subject}</td>
                    <td>{claim.customerEmail || "—"}</td>
                    <td><span className={`badge ${claim.status}`}>{claim.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="admin-panel">
        <h3>Recent admin actions</h3>
        {(data.recentAudit || []).length === 0 ? <p className="admin-muted">No audit events yet.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead>
              <tbody>
                {data.recentAudit.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdAt}</td>
                    <td>{row.actionType}</td>
                    <td>{row.targetType}</td>
                    <td>{row.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="admin-panel">
        <h3>Recent webhook events</h3>
        {(data.recentWebhooks || []).length === 0 ? <p className="admin-muted">No webhooks yet.</p> : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>When</th><th>Type</th><th>Processed</th></tr></thead>
              <tbody>
                {data.recentWebhooks.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdAt}</td>
                    <td>{row.eventType}</td>
                    <td>{row.processed ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
