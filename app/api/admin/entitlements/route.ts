import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  writeAudit,
  entitlements,
  desc,
  eq,
  sql,
} from "../../../../lib/admin-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "entitlements:read");
  if (auth instanceof Response) return auth;
  const status = request.nextUrl.searchParams.get("status");
  let rows = await auth.db.select().from(entitlements).orderBy(desc(entitlements.updatedAt)).limit(300);
  if (status) rows = rows.filter((row) => row.status === status);
  const now = Date.now();
  rows = rows.map((row) => ({
    ...row,
    computedStatus:
      row.status === "revoked"
        ? "revoked"
        : Date.parse(row.endsAt) <= now
          ? "expired"
          : "active",
  }));
  return NextResponse.json({ entitlements: rows, privacyNote: "Admin views never show file contents." });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "entitlements:write");
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "grant" | "revoke" | "extend";
    entitlementId?: number;
    deviceId?: string;
    email?: string;
    days?: number;
    reason?: string;
  };
  if (!body.reason?.trim()) {
    return NextResponse.json({ error: "Reason is required for entitlement changes." }, { status: 400 });
  }

  const now = Date.now();
  if (body.action === "grant") {
    const days = Math.max(1, Math.min(365, body.days || 30));
    const startsAt = new Date(now).toISOString();
    const endsAt = new Date(now + days * 86400000).toISOString();
    const inserted = await auth.db
      .insert(entitlements)
      .values({
        deviceId: body.deviceId || null,
        email: body.email?.toLowerCase() || null,
        source: "manual",
        status: "active",
        startsAt,
        endsAt,
        reason: body.reason,
        createdByAdminId: auth.session.adminId,
      })
      .returning();
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "entitlement.grant",
      targetType: "entitlement",
      targetId: inserted[0].id,
      reason: body.reason,
    });
    return NextResponse.json({ entitlement: inserted[0] });
  }

  if (!body.entitlementId) {
    return NextResponse.json({ error: "entitlementId required." }, { status: 400 });
  }

  const [current] = await auth.db
    .select()
    .from(entitlements)
    .where(eq(entitlements.id, body.entitlementId))
    .limit(1);
  if (!current) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (body.action === "revoke") {
    await auth.db
      .update(entitlements)
      .set({ status: "revoked", reason: body.reason, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(entitlements.id, current.id));
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "entitlement.revoke",
      targetType: "entitlement",
      targetId: current.id,
      reason: body.reason,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "extend") {
    const days = Math.max(1, Math.min(365, body.days || 30));
    const base = Math.max(now, Date.parse(current.endsAt) || now);
    const endsAt = new Date(base + days * 86400000).toISOString();
    await auth.db
      .update(entitlements)
      .set({
        status: "active",
        endsAt,
        reason: body.reason,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(entitlements.id, current.id));
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "entitlement.extend",
      targetType: "entitlement",
      targetId: current.id,
      reason: body.reason,
      metadata: { days },
    });
    return NextResponse.json({ ok: true, endsAt });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
