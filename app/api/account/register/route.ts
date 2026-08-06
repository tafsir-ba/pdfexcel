import { NextRequest, NextResponse } from "next/server";
import { withAdminDb, recordPaidCheckout, pricingPlans, and, eq } from "../../../../lib/admin-data";
import {
  bindCustomerDevice,
  findCustomerByEmail,
  setCustomerPassword,
} from "../../../../lib/customer-access";
import {
  createCustomerSessionToken,
  customerSessionCookieHeader,
  validateCustomerPassword,
} from "../../../../lib/customer-auth";

const DEFAULT_DURATION_DAYS = 30;
const DEFAULT_PRODUCT = "formbatch_30_day_access";

/** Create/complete customer account after Stripe payment using the Checkout session as proof. */
export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Account setup is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    deviceId?: string;
    password?: string;
  };
  const sessionId = body.sessionId?.trim();
  const deviceId = body.deviceId?.trim();
  const password = body.password || "";
  const passwordError = validateCustomerPassword(password);
  if (!sessionId?.startsWith("cs_") || !deviceId || deviceId.length > 100) {
    return NextResponse.json({ error: "Payment details are incomplete." }, { status: 400 });
  }
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
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
  const email = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (
    session.payment_status !== "paid" ||
    productKey !== DEFAULT_PRODUCT ||
    !email
  ) {
    return NextResponse.json({ error: "No completed payment with email was found." }, { status: 402 });
  }

  const createdAt = (session.created || Math.floor(Date.now() / 1000)) * 1000;
  const result = await withAdminDb(async (db) => {
    let durationDays = DEFAULT_DURATION_DAYS;
    const [plan] = await db
      .select()
      .from(pricingPlans)
      .where(and(eq(pricingPlans.productKey, productKey), eq(pricingPlans.active, true)))
      .limit(1);
    durationDays = plan?.durationDays || DEFAULT_DURATION_DAYS;

    const expiresAt = createdAt + durationDays * 24 * 60 * 60 * 1000;
    if (expiresAt <= Date.now()) {
      return { error: "This payment has expired.", status: 402 as const };
    }

    const recorded = await recordPaidCheckout(db, {
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

    const customer = await findCustomerByEmail(db, email);
    if (!customer) {
      return { error: "Customer record could not be created.", status: 500 as const };
    }

    await setCustomerPassword(db, customer.id, password);
    await bindCustomerDevice(db, customer.id, email, deviceId);
    const token = await createCustomerSessionToken({ customerId: customer.id, email });
    return {
      expiresAt: new Date(recorded.endsAt).getTime(),
      email,
      token,
      status: 200 as const,
    };
  });

  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const response = NextResponse.json({
    ok: true,
    email: result.email,
    expiresAt: result.expiresAt,
  });
  response.headers.set("Set-Cookie", customerSessionCookieHeader(result.token!));
  return response;
}
