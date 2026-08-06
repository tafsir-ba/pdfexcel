import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  transactions,
  entitlements,
  webhookEvents,
  adminNotes,
  claimCases,
  eq,
  desc,
} from "../../../../../lib/admin-data";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request, "transactions:read");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const transactionId = Number(id);
  if (!Number.isFinite(transactionId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const [tx] = await auth.db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
  if (!tx) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const relatedEntitlements = await auth.db
    .select()
    .from(entitlements)
    .where(eq(entitlements.transactionId, tx.id))
    .orderBy(desc(entitlements.createdAt));
  const notes = await auth.db
    .select()
    .from(adminNotes)
    .where(eq(adminNotes.transactionId, tx.id))
    .orderBy(desc(adminNotes.createdAt));
  const claims = await auth.db
    .select()
    .from(claimCases)
    .where(eq(claimCases.transactionId, tx.id))
    .orderBy(desc(claimCases.createdAt));
  const webhooks = tx.providerSessionId
    ? await auth.db.select().from(webhookEvents).orderBy(desc(webhookEvents.createdAt)).limit(20)
    : [];

  return NextResponse.json({
    privacyNote: "File contents are never stored.",
    transaction: tx,
    entitlements: relatedEntitlements,
    notes,
    claims,
    webhooks: webhooks.filter((event) => event.payloadSummary?.includes(tx.providerSessionId || "___")),
  });
}
