import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  writeAudit,
  customers,
  transactions,
  entitlements,
  usageEvents,
  claimCases,
  adminNotes,
  eq,
  desc,
} from "../../../../lib/admin-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "export:read");
  if (auth instanceof Response) return auth;
  const email = request.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim();
  if (!email && !deviceId) {
    return NextResponse.json({ error: "email or deviceId required." }, { status: 400 });
  }

  const customerRows = email
    ? await auth.db.select().from(customers).where(eq(customers.email, email))
    : await auth.db.select().from(customers).where(eq(customers.deviceId, deviceId!));

  const deviceIds = new Set<string>();
  if (deviceId) deviceIds.add(deviceId);
  for (const row of customerRows) {
    if (row.deviceId) deviceIds.add(row.deviceId);
  }

  const tx = email
    ? await auth.db.select().from(transactions).where(eq(transactions.customerEmail, email)).orderBy(desc(transactions.createdAt))
    : await auth.db.select().from(transactions).where(eq(transactions.deviceId, deviceId!)).orderBy(desc(transactions.createdAt));
  const ents = email
    ? await auth.db.select().from(entitlements).where(eq(entitlements.email, email)).orderBy(desc(entitlements.createdAt))
    : await auth.db.select().from(entitlements).where(eq(entitlements.deviceId, deviceId!)).orderBy(desc(entitlements.createdAt));

  const usage = [];
  for (const id of deviceIds) {
    const rows = await auth.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.deviceId, id))
      .orderBy(desc(usageEvents.createdAt));
    usage.push(...rows);
  }

  const claims = email
    ? await auth.db.select().from(claimCases).where(eq(claimCases.customerEmail, email)).orderBy(desc(claimCases.createdAt))
    : await auth.db.select().from(claimCases).where(eq(claimCases.deviceId, deviceId!)).orderBy(desc(claimCases.createdAt));

  const notes = [];
  for (const claim of claims) {
    const claimNotes = await auth.db
      .select()
      .from(adminNotes)
      .where(eq(adminNotes.claimCaseId, claim.id))
      .orderBy(desc(adminNotes.createdAt));
    notes.push(...claimNotes);
  }
  for (const customer of customerRows) {
    const customerNotes = await auth.db
      .select()
      .from(adminNotes)
      .where(eq(adminNotes.customerId, customer.id))
      .orderBy(desc(adminNotes.createdAt));
    notes.push(...customerNotes);
  }

  await writeAudit(auth.db, {
    adminUserId: auth.session.adminId,
    actionType: "customer.export",
    targetType: "customer",
    targetId: email || deviceId,
  });

  return NextResponse.json({
    privacyNote: "File contents are never stored. Export contains payment, entitlement, usage metadata, claims, and admin notes only.",
    exportedAt: new Date().toISOString(),
    customers: customerRows,
    transactions: tx,
    entitlements: ents,
    usageEvents: usage,
    claims,
    adminNotes: notes,
  });
}
