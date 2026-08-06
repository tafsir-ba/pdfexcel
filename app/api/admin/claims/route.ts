import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  writeAudit,
  claimCases,
  adminNotes,
  transactions,
  entitlements,
  usageEvents,
  desc,
  eq,
  sql,
} from "../../../../lib/admin-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "claims:read");
  if (auth instanceof Response) return auth;
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const id = request.nextUrl.searchParams.get("id");
  if (id) {
    const claimId = Number(id);
    const [claim] = await auth.db.select().from(claimCases).where(eq(claimCases.id, claimId)).limit(1);
    if (!claim) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const notes = await auth.db
      .select()
      .from(adminNotes)
      .where(eq(adminNotes.claimCaseId, claim.id))
      .orderBy(desc(adminNotes.createdAt));
    const tx = claim.transactionId
      ? await auth.db.select().from(transactions).where(eq(transactions.id, claim.transactionId))
      : [];
    const ents = claim.deviceId
      ? await auth.db.select().from(entitlements).where(eq(entitlements.deviceId, claim.deviceId)).orderBy(desc(entitlements.createdAt)).limit(10)
      : [];
    const usage = claim.deviceId
      ? await auth.db.select().from(usageEvents).where(eq(usageEvents.deviceId, claim.deviceId)).orderBy(desc(usageEvents.createdAt)).limit(20)
      : [];
    return NextResponse.json({
      privacyNote: "File contents are never stored.",
      claim,
      notes,
      transactions: tx,
      entitlements: ents,
      usage,
    });
  }

  let rows = await auth.db.select().from(claimCases).orderBy(desc(claimCases.updatedAt)).limit(200);
  if (q) {
    rows = rows.filter(
      (row) =>
        row.customerEmail?.toLowerCase().includes(q) ||
        row.deviceId?.toLowerCase().includes(q) ||
        row.subject.toLowerCase().includes(q),
    );
  }
  return NextResponse.json({ claims: rows, privacyNote: "File contents are never stored." });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "claims:write");
  if (auth instanceof Response) return auth;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "create" | "note" | "status";
    id?: number;
    subject?: string;
    customerEmail?: string;
    deviceId?: string;
    transactionId?: number;
    status?: "open" | "investigating" | "resolved" | "refunded" | "rejected";
    body?: string;
    reason?: string;
  };

  if (body.action === "create") {
    if (!body.subject?.trim()) return NextResponse.json({ error: "subject required." }, { status: 400 });
    const inserted = await auth.db
      .insert(claimCases)
      .values({
        subject: body.subject.trim(),
        customerEmail: body.customerEmail?.toLowerCase() || null,
        deviceId: body.deviceId || null,
        transactionId: body.transactionId || null,
        status: "open",
        createdByAdminId: auth.session.adminId,
      })
      .returning();
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "claim.create",
      targetType: "claim_case",
      targetId: inserted[0].id,
      reason: body.reason || null,
    });
    return NextResponse.json({ claim: inserted[0] });
  }

  if (!body.id) return NextResponse.json({ error: "id required." }, { status: 400 });

  if (body.action === "note") {
    if (!body.body?.trim()) return NextResponse.json({ error: "note body required." }, { status: 400 });
    const inserted = await auth.db
      .insert(adminNotes)
      .values({
        claimCaseId: body.id,
        adminUserId: auth.session.adminId,
        body: body.body.trim(),
      })
      .returning();
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "claim.note",
      targetType: "claim_case",
      targetId: body.id,
    });
    return NextResponse.json({ note: inserted[0] });
  }

  if (body.action === "status" && body.status) {
    await auth.db
      .update(claimCases)
      .set({ status: body.status, updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(claimCases.id, body.id));
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "claim.status",
      targetType: "claim_case",
      targetId: body.id,
      reason: body.reason || null,
      metadata: { status: body.status },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
