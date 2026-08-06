import { NextRequest, NextResponse } from "next/server";
import { withAdminDb, pricingPlans, and, eq } from "../../../lib/admin-data";

const DEFAULT_PLAN = {
  name: "PDF Mail Merge 30-day access",
  amountCents: 1900,
  currency: "usd",
  durationDays: 30,
  productKey: "formbatch_30_day_access",
  description: "Unlimited spreadsheet-to-PDF mail merge batches on one device for 30 days",
};

async function resolveLivePlan() {
  try {
    return await withAdminDb(async (db) => {
      const [plan] = await db
        .select()
        .from(pricingPlans)
        .where(and(eq(pricingPlans.active, true), eq(pricingPlans.archived, false)))
        .limit(1);
      if (!plan) return DEFAULT_PLAN;
      return {
        name: plan.name,
        amountCents: plan.amountCents,
        currency: plan.currency || "usd",
        durationDays: plan.durationDays,
        productKey: plan.productKey,
        description: `Unlimited spreadsheet-to-PDF mail merge batches on one device for ${plan.durationDays} days`,
      };
    });
  } catch {
    return DEFAULT_PLAN;
  }
}

export async function POST(request: NextRequest) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Checkout is being connected. Please try again shortly." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
  const deviceId = body.deviceId?.trim();
  if (!deviceId || deviceId.length > 100) {
    return NextResponse.json({ error: "This browser could not be identified." }, { status: 400 });
  }

  const plan = await resolveLivePlan();
  const origin = new URL(request.url).origin;
  const parameters = new URLSearchParams();
  parameters.set("mode", "payment");
  parameters.set("line_items[0][price_data][currency]", plan.currency);
  parameters.set("line_items[0][price_data][unit_amount]", String(plan.amountCents));
  parameters.set("line_items[0][price_data][product_data][name]", plan.name);
  parameters.set("line_items[0][price_data][product_data][description]", plan.description);
  parameters.set("line_items[0][quantity]", "1");
  parameters.set("success_url", `${origin}/?session_id={CHECKOUT_SESSION_ID}`);
  parameters.set("cancel_url", `${origin}/?checkout=cancelled`);
  parameters.set("metadata[device_id]", deviceId);
  parameters.set("metadata[product]", plan.productKey);
  parameters.set("metadata[duration_days]", String(plan.durationDays));
  parameters.set("payment_intent_data[metadata][device_id]", deviceId);
  parameters.set("payment_intent_data[metadata][product]", plan.productKey);
  parameters.set("allow_promotion_codes", "true");
  parameters.set("billing_address_collection", "auto");

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: parameters,
  });
  const session = (await stripeResponse.json()) as { url?: string; error?: { message?: string } };

  if (!stripeResponse.ok || !session.url) {
    return NextResponse.json(
      { error: session.error?.message || "Stripe could not create the checkout." },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: session.url });
}
