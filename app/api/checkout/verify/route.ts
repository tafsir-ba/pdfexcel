import { NextRequest, NextResponse } from "next/server";
import { withAdminDb, recordPaidCheckout, pricingPlans, and, eq } from "../../../lib/admin-data";

const DEFAULT_DURATION_DAYS = 30;
const DEFAULT_PRODUCT = "formbatch_30_day_access";

export async function GET(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Payment verification is not configured." }, { status: 503 });
  }

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const deviceId = request.nextUrl.searchParams.get("device_id");
  if (!sessionId?.startsWith("cs_") || !deviceId) {
    return NextResponse.json({ error: "Payment details are incomplete." }, { status: 400 });
  }

  const stripeResponse = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const session = (await stripeResponse.json()) as {
    payment_status?: string;
    payment_intent?: string;
    amount_total?: number;
    currency?: string;
    customer?: string;
    customer_details?: { email?: string | null };
    customer_email?: string | null;
    created?: number;
    metadata?: { device_id?: string; product?: string };
    error?: { message?: string };
  };

  if (!stripeResponse.ok) {
    return NextResponse.json({ error: session.error?.message || "Payment could not be verified." }, { status: 502 });
  }

  const productKey = session.metadata?.product || DEFAULT_PRODUCT;
  const paid =
    session.payment_status === "paid" &&
    session.metadata?.device_id === deviceId &&
    productKey === DEFAULT_PRODUCT;
  if (!paid) {
    return NextResponse.json({ paid: false, error: "No completed PDF Mail Merge payment was found." }, { status: 402 });
  }

  const createdAt = (session.created || Math.floor(Date.now() / 1000)) * 1000;
  let durationDays = DEFAULT_DURATION_DAYS;
  try {
    durationDays = await withAdminDb(async (db) => {
      const [plan] = await db
        .select()
        .from(pricingPlans)
        .where(and(eq(pricingPlans.productKey, productKey), eq(pricingPlans.active, true)))
        .limit(1);
      return plan?.durationDays || DEFAULT_DURATION_DAYS;
    });
  } catch {
    durationDays = DEFAULT_DURATION_DAYS;
  }

  const expiresAt = createdAt + durationDays * 24 * 60 * 60 * 1000;
  if (expiresAt <= Date.now()) {
    return NextResponse.json(
      { paid: false, error: "This PDF Mail Merge payment has expired." },
      { status: 402 },
    );
  }

  const email = session.customer_details?.email || session.customer_email || null;
  try {
    await withAdminDb(async (db) => {
      await recordPaidCheckout(db, {
        sessionId,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        deviceId,
        email,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        amountCents: session.amount_total ?? 1900,
        currency: session.currency || "usd",
        createdMs: createdAt,
        durationDays,
        productKey,
      });
    });
  } catch (error) {
    console.error("Failed to persist checkout entitlement", error);
  }

  return NextResponse.json({ paid: true, expiresAt });
}
