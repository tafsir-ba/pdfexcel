import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  transactions,
  customers,
  desc,
} from "../../../../lib/admin-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "transactions:read");
  if (auth instanceof Response) return auth;
  const { db } = auth;
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim().toLowerCase() || "";
  const from = params.get("from");
  const to = params.get("to");
  const status = params.get("status");

  let rows = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(200);
  if (status) rows = rows.filter((row) => row.status === status);
  if (from) rows = rows.filter((row) => row.createdAt >= from);
  if (to) rows = rows.filter((row) => row.createdAt <= `${to}T23:59:59`);
  if (q) {
    const stripeMatches = await db.select().from(customers);
    const customerIds = new Set(
      stripeMatches
        .filter(
          (customer) =>
            customer.stripeCustomerId?.toLowerCase().includes(q) ||
            customer.email?.toLowerCase().includes(q) ||
            customer.deviceId?.toLowerCase().includes(q),
        )
        .map((customer) => customer.id),
    );
    rows = rows.filter(
      (row) =>
        row.customerEmail?.toLowerCase().includes(q) ||
        row.providerSessionId?.toLowerCase().includes(q) ||
        row.providerPaymentId?.toLowerCase().includes(q) ||
        row.deviceId?.toLowerCase().includes(q) ||
        String(row.id) === q ||
        (row.customerId != null && customerIds.has(row.customerId)),
    );
  }

  return NextResponse.json({
    privacyNote: "File contents are never stored.",
    transactions: rows,
  });
}
