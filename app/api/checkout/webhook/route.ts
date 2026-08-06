import { NextRequest, NextResponse } from "next/server";
import {
  withAdminDb,
  recordPaidCheckout,
  webhookEvents,
  transactions,
  pricingPlans,
  and,
  eq,
  sql,
} from "../../../../lib/admin-data";

async function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((item) => {
      const [key, ...rest] = item.split("=");
      return [key.trim(), rest.join("=")];
    }),
  ) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${parts.t}.${payload}`));
  const digest = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return digest === parts.v1;
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await request.text();

  if (secret) {
    const valid = await verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }
  }

  const event = JSON.parse(payload) as {
    id: string;
    type: string;
    data?: { object?: Record<string, unknown> };
  };

  try {
    await withAdminDb(async (db) => {
      const [existing] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.eventId, event.id))
        .limit(1);
      if (existing?.processed) return;

      if (!existing) {
        await db.insert(webhookEvents).values({
          provider: "stripe",
          eventId: event.id,
          eventType: event.type,
          payloadSummary: JSON.stringify({
            type: event.type,
            objectId: (event.data?.object as { id?: string } | undefined)?.id,
          }),
          processed: false,
        });
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data?.object as {
          id?: string;
          payment_status?: string;
          payment_intent?: string;
          amount_total?: number;
          currency?: string;
          customer?: string;
          customer_details?: { email?: string };
          customer_email?: string;
          created?: number;
          metadata?: { device_id?: string; product?: string; duration_days?: string };
        };
        if (session?.payment_status === "paid" && session.metadata?.device_id && session.id) {
          const productKey = session.metadata.product || "formbatch_30_day_access";
          const [plan] = await db
            .select()
            .from(pricingPlans)
            .where(and(eq(pricingPlans.productKey, productKey), eq(pricingPlans.active, true)))
            .limit(1);
          const durationDays =
            plan?.durationDays ||
            Number.parseInt(session.metadata.duration_days || "30", 10) ||
            30;
          const createdMs = (session.created || Math.floor(Date.now() / 1000)) * 1000;
          await recordPaidCheckout(db, {
            sessionId: session.id,
            paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            deviceId: session.metadata.device_id,
            email: session.customer_details?.email || session.customer_email || null,
            stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
            amountCents: session.amount_total ?? 1900,
            currency: session.currency || "usd",
            createdMs,
            durationDays,
            productKey,
          });
        }
      }

      if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
        const charge = event.data?.object as {
          payment_intent?: string;
          amount_refunded?: number;
          amount?: number;
        };
        if (charge?.payment_intent) {
          await db
            .update(transactions)
            .set({
              status: event.type === "charge.dispute.created" ? "disputed" : "refunded",
              refundedAmountCents: charge.amount_refunded ?? charge.amount ?? 0,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(transactions.providerPaymentId, charge.payment_intent));
        }
      }

      await db
        .update(webhookEvents)
        .set({ processed: true })
        .where(eq(webhookEvents.eventId, event.id));
    });
  } catch (error) {
    console.error("Webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
