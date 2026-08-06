import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  writeAudit,
  pricingPlans,
  transactions,
  eq,
  sql,
  desc,
} from "../../../../lib/admin-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "pricing:read");
  if (auth instanceof Response) return auth;
  const plans = await auth.db.select().from(pricingPlans).orderBy(desc(pricingPlans.createdAt));
  return NextResponse.json({ plans, privacyNote: "Admin views never show file contents." });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "pricing:write");
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "create" | "update" | "archive";
    id?: number;
    name?: string;
    amountCents?: number;
    currency?: string;
    durationDays?: number;
    freeGenerationLimit?: number;
    productKey?: string;
    active?: boolean;
    reason?: string;
  };

  if (body.action === "create") {
    if (!body.name || !body.productKey || body.amountCents == null) {
      return NextResponse.json({ error: "name, productKey, amountCents required." }, { status: 400 });
    }
    const inserted = await auth.db
      .insert(pricingPlans)
      .values({
        name: body.name,
        amountCents: body.amountCents,
        currency: body.currency || "usd",
        durationDays: body.durationDays || 30,
        freeGenerationLimit: body.freeGenerationLimit ?? 3,
        productKey: body.productKey,
        active: body.active !== false,
        archived: false,
      })
      .returning();
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "pricing.create",
      targetType: "pricing_plan",
      targetId: inserted[0].id,
      reason: body.reason || null,
    });
    return NextResponse.json({ plan: inserted[0] });
  }

  if (!body.id) return NextResponse.json({ error: "id required." }, { status: 400 });

  if (body.action === "archive") {
    const related = await auth.db
      .select()
      .from(transactions)
      .where(eq(transactions.pricingPlanId, body.id))
      .limit(1);
    await auth.db
      .update(pricingPlans)
      .set({ archived: true, active: false, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(pricingPlans.id, body.id));
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "pricing.archive",
      targetType: "pricing_plan",
      targetId: body.id,
      reason: body.reason || (related.length ? "has_history" : "manual_archive"),
    });
    return NextResponse.json({ ok: true, archived: true, hadTransactions: related.length > 0 });
  }

  if (body.action === "update") {
    await auth.db
      .update(pricingPlans)
      .set({
        name: body.name,
        amountCents: body.amountCents,
        currency: body.currency,
        durationDays: body.durationDays,
        freeGenerationLimit: body.freeGenerationLimit,
        active: body.active,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(pricingPlans.id, body.id));
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "pricing.update",
      targetType: "pricing_plan",
      targetId: body.id,
      reason: body.reason || null,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action. Deleting plans is disabled; archive instead." }, { status: 400 });
}
