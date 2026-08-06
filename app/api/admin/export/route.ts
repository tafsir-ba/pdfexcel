import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  writeAudit,
  customers,
  transactions,
  entitlements,
  usageEvents,
  claimCases,
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

  const tx = email
    ? await auth.db.select().from(transactions).where(eq(transactions.customerEmail, email)).orderBy(desc(transactions.createdAt))
    : await auth.db.select().from(transactions).where(eq(transactions.deviceId, deviceId!)).orderBy(desc(transactions.createdAt));
  const ents = email
    ? await auth.db.select().from(entitlements).where(eq(entitlements.email, email)).orderBy(desc(entitlements.createdAt))
    : await auth.db.select().from(entitlements).where(eq(entitlements.deviceId, deviceId!)).orderBy(desc(entitlements.createdAt));
  const usage = deviceId
    ? await auth.db.select().from(usageEvents).where(eq(usageEvents.deviceId, deviceId)).orderBy(desc(usageEvents.createdAt))
    : [];
  const claims = email
    ? await auth.db.select().from(claimCases).where(eq(claimCases.customerEmail, email)).orderBy(desc(claimCases.createdAt))
    : await auth.db.select().from(claimCases).where(eq(claimCases.deviceId, deviceId!)).orderBy(desc(claimCases.createdAt));

  await writeAudit(auth.db, {
    adminUserId: auth.session.adminId,
    actionType: "customer.export",
    targetType: "customer",
    targetId: email || deviceId,
  });

  return NextResponse.json({
    privacyNote: "File contents are never stored. Export contains payment, entitlement, usage metadata, and claims only.",
    exportedAt: new Date().toISOString(),
    customers: customerRows,
    transactions: tx,
    entitlements: ents,
    usageEvents: usage,
    claims,
  });
}
