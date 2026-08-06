"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Plan = {
  id: number;
  name: string;
  amountCents: number;
  currency: string;
  durationDays: number;
  freeGenerationLimit: number;
  productKey: string;
  active: boolean;
  archived: boolean;
};

export default function AdminPricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({
    name: "PDF Mail Merge 30-day access",
    amountCents: 1900,
    currency: "usd",
    durationDays: 30,
    freeGenerationLimit: 3,
    productKey: "formbatch_30_day_access",
  });
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/pricing");
    if (response.status === 401) {
      router.replace("/admin/login");
      return;
    }
    const result = await response.json();
    setPlans(result.plans || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPlan(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", ...form }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Plan created." : result.error || "Failed.");
    if (response.ok) await load();
  }

  async function archive(id: number) {
    const reason = prompt("Archive reason") || "archived";
    const response = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", id, reason }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Plan archived (delete blocked when history exists)." : result.error || "Failed.");
    if (response.ok) await load();
  }

  async function toggleActive(plan: Plan) {
    const reason = prompt(plan.active ? "Deactivate reason" : "Activate reason") || "pricing.update";
    const response = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: plan.id,
        name: plan.name,
        amountCents: plan.amountCents,
        currency: plan.currency,
        durationDays: plan.durationDays,
        freeGenerationLimit: plan.freeGenerationLimit,
        active: !plan.active,
        reason,
      }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Plan updated." : result.error || "Failed.");
    if (response.ok) await load();
  }

  async function editPlan(plan: Plan) {
    const amount = prompt("Amount in cents", String(plan.amountCents));
    if (amount == null) return;
    const days = prompt("Duration days", String(plan.durationDays));
    if (days == null) return;
    const free = prompt("Free generation limit", String(plan.freeGenerationLimit));
    if (free == null) return;
    const reason = prompt("Reason for update") || "pricing.update";
    const response = await fetch("/api/admin/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        id: plan.id,
        name: plan.name,
        amountCents: Number(amount),
        currency: plan.currency,
        durationDays: Number(days),
        freeGenerationLimit: Number(free),
        active: plan.active,
        reason,
      }),
    });
    const result = await response.json();
    setMessage(response.ok ? "Plan updated." : result.error || "Failed.");
    if (response.ok) await load();
  }

  return (
    <>
      <div className="admin-header">
        <div>
          <h1>Pricing</h1>
          <p>Current live access products. Plans with transaction history can be archived, not deleted.</p>
        </div>
      </div>
      <form className="admin-panel admin-form" onSubmit={createPlan}>
        <h3>Create plan</h3>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label>Amount (cents)<input type="number" value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: Number(e.target.value) })} /></label>
        <label>Currency<input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></label>
        <label>Duration days<input type="number" value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: Number(e.target.value) })} /></label>
        <label>Free generation limit<input type="number" value={form.freeGenerationLimit} onChange={(e) => setForm({ ...form, freeGenerationLimit: Number(e.target.value) })} /></label>
        <label>Product key<input value={form.productKey} onChange={(e) => setForm({ ...form, productKey: e.target.value })} /></label>
        <button type="submit">Create</button>
        {message ? <p className="admin-muted">{message}</p> : null}
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>Amount</th><th>Duration</th><th>Free</th><th>Key</th><th>Flags</th><th></th></tr>
          </thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td>{plan.name}</td>
                <td>{(plan.amountCents / 100).toFixed(2)} {plan.currency}</td>
                <td>{plan.durationDays}d</td>
                <td>{plan.freeGenerationLimit}</td>
                <td>{plan.productKey}</td>
                <td>{plan.active ? "active" : "inactive"}{plan.archived ? " · archived" : ""}</td>
                <td>
                  {plan.archived ? "—" : (
                    <>
                      <button className="admin-btn secondary" type="button" onClick={() => void editPlan(plan)}>Edit</button>{" "}
                      <button className="admin-btn secondary" type="button" onClick={() => void toggleActive(plan)}>
                        {plan.active ? "Deactivate" : "Activate"}
                      </button>{" "}
                      <button className="admin-btn secondary" type="button" onClick={() => void archive(plan.id)}>Archive</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
