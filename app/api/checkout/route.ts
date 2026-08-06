import { NextRequest, NextResponse } from "next/server";
import { resolveLivePlan } from "../../../lib/live-pricing";

/** Prefer forwarded HTTPS host so Stripe return URLs are never http:// behind nginx. */
function publicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    forwardedProto ||
    (request.nextUrl.protocol === "https:" ? "https" : host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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
  const origin = publicOrigin(request);
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
  parameters.set("customer_creation", "always");
  // Card-only avoids Stripe Dashboard Amazon Pay misconfig console noise for this flow.
  parameters.set("payment_method_types[0]", "card");

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
