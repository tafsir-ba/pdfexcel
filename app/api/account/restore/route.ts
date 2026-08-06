import { NextRequest, NextResponse } from "next/server";
import { withAdminDb, recordPaidCheckout, pricingPlans, and, eq } from "../../../../lib/admin-data";
import {
  bindCustomerDevice,
  findCustomerByEmail,
} from "../../../../lib/customer-access";
import {
  createCustomerSessionToken,
  customerSessionCookieHeader,
} from "../../../../lib/customer-auth";

const DEFAULT_DURATION_DAYS = 30;
const DEFAULT_PRODUCT = "formbatch_30_day_access";

function extractSessionId(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("cs_")) return trimmed.split(/[?#\s]/)[0];
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get("session_id");
    if (fromQuery?.startsWith("cs_")) return fromQuery;
  } catch {
    /* not a URL */
  }
  const match = trimmed.match(/cs_[A-Za-z0-9_]+/);
  return match?.[0] || "";
}

/** Restore paid access from a Stripe Checkout session (receipt / success URL). */
export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Purchase restore is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string;
    deviceId?: string;
  };
  const sessionId = extractSessionId(body.sessionId || "");
  const deviceId = body.deviceId?.trim() || "";
  if (!sessionId.startsWith("cs_") || !deviceId || deviceId.length > 100) {
    return NextResponse.json(
      { error: "Paste the Stripe checkout session id or success link from your receipt." },
      { status: 400 },
    );
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
  if (session.payment_status !== "paid") {
    return NextResponse.json({ error: "No completed PDF Batch payment was found for that session." }, { status: 402 });
  }

  const productKey = session.metadata?.product || DEFAULT_PRODUCT;
  const email = (session.customer_details?.email || session.customer_email || "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "That payment has no email on file." }, { status: 402 });
  }

  const createdAt = (session.created || Math.floor(Date.now() / 1000)) * 1000;
  try {
    const result = await withAdminDb(async (db) => {
      const [plan] = await db
        .select()
        .from(pricingPlans)
        .where(
          and(
            eq(pricingPlans.productKey, productKey),
            eq(pricingPlans.active, true),
            eq(pricingPlans.archived, false),
          ),
        )
        .limit(1);
      const allowed = Boolean(plan) || productKey === DEFAULT_PRODUCT;
      if (!allowed) {
        return { error: "No completed PDF Batch payment was found for that session.", status: 402 as const };
      }
      const durationDays = plan?.durationDays || DEFAULT_DURATION_DAYS;
      const expiresAt = createdAt + durationDays * 24 * 60 * 60 * 1000;
      if (expiresAt <= Date.now()) {
        return { error: "This PDF Batch payment has expired.", status: 402 as const };
      }

      const recorded = await recordPaidCheckout(db, {
        sessionId,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        deviceId,
        email,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        amountCents: session.amount_total ?? plan?.amountCents ?? 1900,
        currency: session.currency || "usd",
        createdMs: createdAt,
        durationDays,
        productKey,
      });

      const customer = await findCustomerByEmail(db, email);
      if (!customer) {
        return { error: "Customer record could not be created.", status: 500 as const };
      }
      await bindCustomerDevice(db, customer.id, email, deviceId);
      const token = await createCustomerSessionToken(
        { customerId: customer.id, email },
        Math.max(60_000, new Date(recorded.endsAt).getTime() - Date.now()),
      );
      return {
        email,
        expiresAt: new Date(recorded.endsAt).getTime(),
        needsPassword: !customer.passwordHash,
        token,
        status: 200 as const,
      };
    });

    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const maxAge = Math.max(60, Math.floor(((result.expiresAt as number) - Date.now()) / 1000));
    const response = NextResponse.json({
      ok: true,
      email: result.email,
      expiresAt: result.expiresAt,
      needsPassword: result.needsPassword,
    });
    response.headers.set("Set-Cookie", customerSessionCookieHeader(result.token!, maxAge));
    return response;
  } catch (error) {
    console.error("Purchase restore failed", error);
    return NextResponse.json({ error: "Purchase could not be restored." }, { status: 500 });
  }
}
