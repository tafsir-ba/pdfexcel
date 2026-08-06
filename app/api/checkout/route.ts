import { NextRequest, NextResponse } from "next/server";

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

  const origin = new URL(request.url).origin;
  const parameters = new URLSearchParams();
  parameters.set("mode", "payment");
  parameters.set("line_items[0][price_data][currency]", "usd");
  parameters.set("line_items[0][price_data][unit_amount]", "1900");
  parameters.set("line_items[0][price_data][product_data][name]", "PDF Mail Merge 30-day access");
  parameters.set(
    "line_items[0][price_data][product_data][description]",
    "Unlimited spreadsheet-to-PDF mail merge batches on one device for 30 days",
  );
  parameters.set("line_items[0][quantity]", "1");
  parameters.set("success_url", `${origin}/?session_id={CHECKOUT_SESSION_ID}`);
  parameters.set("cancel_url", `${origin}/?checkout=cancelled`);
  parameters.set("metadata[device_id]", deviceId);
  parameters.set("metadata[product]", "formbatch_30_day_access");
  parameters.set("payment_intent_data[metadata][device_id]", deviceId);
  parameters.set("payment_intent_data[metadata][product]", "formbatch_30_day_access");
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
