"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ClaimRow = {
  id: number;
  subject: string;
  customerEmail: string | null;
  status: string;
};

type ClaimDetail = {
  privacyNote?: string;
  claim: ClaimRow & { deviceId?: string | null };
  transactions: unknown[];
  entitlements: unknown[];
  usage: unknown[];
  notes: unknown[];
};

function ClaimsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [subject, setSubject] = useState("");
  const [email, setEmail] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  async function loadList() {
    const response = await fetch("/api/admin/claims");
    if (response.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const result = await response.json();
    setClaims(result.claims || []);
  }

  async function loadDetail(id: string) {
    const response = await fetch(`/api/admin/claims?id=${id}`);
    const result = await response.json();
    if (response.ok) setDetail(result);
  }

  useEffect(() => {
    const claimId = search.get("id");
    void (async () => {
      const response = await fetch("/api/admin/claims");
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const result = await response.json();
      setClaims(result.claims || []);
      if (claimId) {
        const detailResponse = await fetch(`/api/admin/claims?id=${claimId}`);
        const detailResult = await detailResponse.json();
        if (detailResponse.ok) setDetail(detailResult);
      }
    })();
  }, [search, router]);

  async function createClaim(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", subject, customerEmail: email, deviceId }),
    });
    const result = await response.json();
    setMessage(response.ok ? `Claim #${result.claim.id} created.` : result.error || "Failed.");
    if (response.ok) {
      setSubject("");
      await loadList();
      await loadDetail(String(result.claim.id));
    }
  }

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!detail?.claim?.id) return;
    const response = await fetch("/api/admin/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", id: detail.claim.id, body: note }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Note added." : result.error || "Failed.");
    if (response.ok) {
      setNote("");
      await loadDetail(String(detail.claim.id));
    }
  }

  async function setStatus(status: string) {
    if (!detail?.claim?.id) return;
    const reason = prompt("Reason") || status;
    const response = await fetch("/api/admin/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", id: detail.claim.id, status, reason }),
    });
    if (response.ok) {
      await loadList();
      await loadDetail(String(detail.claim.id));
    }
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Claims / support evidence</h1>
          <p>Investigate with payment, access, and generation metadata only. File contents are never stored.</p>
        </div>
      </div>
      <form className="admin-panel admin-form" onSubmit={createClaim}>
        <h3>Open claim</h3>
        <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} required /></label>
        <label>Customer email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Device id<input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} /></label>
        <button type="submit">Create</button>
        {message ? <p className="admin-muted">{message}</p> : null}
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>ID</th><th>Subject</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.id} onClick={() => void loadDetail(String(claim.id))} style={{ cursor: "pointer" }}>
                <td>{claim.id}</td>
                <td>{claim.subject}</td>
                <td>{claim.customerEmail || "—"}</td>
                <td><span className={`badge ${claim.status}`}>{claim.status}</span></td>
              </tr>
            ))}
            {claims.length === 0 ? <tr><td colSpan={4}>No claims yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {detail ? (
        <div className="admin-panel">
          <h3>Claim #{detail.claim.id}</h3>
          <p className="admin-muted">{detail.privacyNote}</p>
          <div className="admin-toolbar">
            {["open", "investigating", "resolved", "refunded", "rejected"].map((status) => (
              <button key={status} className="admin-btn secondary" type="button" onClick={() => void setStatus(status)}>{status}</button>
            ))}
          </div>
          <h4>Evidence</h4>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify({
            transactions: detail.transactions,
            entitlements: detail.entitlements,
            usage: detail.usage,
            notes: detail.notes,
          }, null, 2)}</pre>
          <form className="admin-form" onSubmit={addNote}>
            <label>Add note<textarea value={note} onChange={(e) => setNote(e.target.value)} required /></label>
            <button type="submit">Save note</button>
          </form>
        </div>
      ) : null}
    </>
  );
}

export default function AdminClaimsPage() {
  return (
    <Suspense fallback={<p className="admin-muted">Loading claims…</p>}>
      <ClaimsInner />
    </Suspense>
  );
}
