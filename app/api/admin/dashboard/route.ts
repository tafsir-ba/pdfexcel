import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  transactions,
  entitlements,
  usageEvents,
  claimCases,
  pricingPlans,
  webhookEvents,
  adminAuditLogs,
  desc,
  eq,
  and,
  gte,
  sql,
} from "../../../../lib/admin-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "dashboard:read");
  if (auth instanceof Response) return auth;
  const { db } = auth;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const [paidRows, failedRows, refundRows, activeEntitlements, expiredEntitlements, usageRows, claims, recentAudit, plans, webhooks] =
    await Promise.all([
      db.select().from(transactions).where(eq(transactions.status, "paid")),
      db.select().from(transactions).where(eq(transactions.status, "failed")),
      db
        .select()
        .from(transactions)
        .where(sql`${transactions.status} in ('refunded','partially_refunded','disputed')`),
      db.select().from(entitlements).where(and(eq(entitlements.status, "active"), gte(entitlements.endsAt, now))),
      db
        .select()
        .from(entitlements)
        .where(
          sql`(${entitlements.status} = 'expired') or (${entitlements.status} = 'active' and ${entitlements.endsAt} < ${now})`,
        ),
      db.select().from(usageEvents).where(gte(usageEvents.createdAt, thirtyDaysAgo)),
      db.select().from(claimCases).orderBy(desc(claimCases.updatedAt)).limit(8),
      db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(8),
      db.select().from(pricingPlans).where(eq(pricingPlans.active, true)),
      db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(5),
    ]);

  const revenueCents = paidRows.reduce((sum, row) => sum + row.amountCents - row.refundedAmountCents, 0);
  const freeUsage = usageRows.filter((row) => row.eventType === "free_preview").length;
  const generationVolume = usageRows.reduce((sum, row) => sum + row.pdfsGenerated, 0);

  return NextResponse.json({
    privacyNote: "File contents are never stored. This dashboard shows payments, entitlements, and generation metadata only.",
    revenueCents,
    successfulPayments: paidRows.length,
    failedPayments: failedRows.length,
    refunds: refundRows.length,
    activePaidUsers: activeEntitlements.length,
    expiredUsers: expiredEntitlements.length,
    freeUsageVolume: freeUsage,
    generationVolume,
    recentClaims: claims,
    recentAudit,
    livePricing: plans,
    recentWebhooks: webhooks,
  });
}
