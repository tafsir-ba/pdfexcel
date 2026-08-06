import { NextRequest, NextResponse } from "next/server";
import {
  withAdminDb,
  recordPaidCheckout,
  webhookEvents,
  transactions,
  entitlements,
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
  const isProd = process.env.NODE_ENV === "production";

  if (!secret) {
    if (isProd) {
      return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is required in production." }, { status: 503 });
    }
  } else {
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

      if (event.type === "payment_intent.payment_failed") {
        const intent = event.data?.object as {
          id?: string;
          amount?: number;
          currency?: string;
          customer?: string;
          metadata?: { device_id?: string };
          last_payment_error?: { message?: string };
        };
        if (intent?.id) {
          const [existingTx] = await db
            .select()
            .from(transactions)
            .where(eq(transactions.providerPaymentId, intent.id))
            .limit(1);
          if (!existingTx) {
            await db.insert(transactions).values({
              provider: "stripe",
              providerPaymentId: intent.id,
              deviceId: intent.metadata?.device_id || null,
              amountCents: intent.amount ?? 0,
              currency: intent.currency || "usd",
              status: "failed",
              rawSummary: JSON.stringify({
                error: intent.last_payment_error?.message || "payment_intent.payment_failed",
                stripeCustomerId: intent.customer || null,
              }),
            });
          } else if (existingTx.status === "pending") {
            await db
              .update(transactions)
              .set({ status: "failed", updatedAt: sql`CURRENT_TIMESTAMP` })
              .where(eq(transactions.id, existingTx.id));
          }
        }
      }

      if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
        const charge = event.data?.object as {
          payment_intent?: string;
          amount_refunded?: number;
          amount?: number;
        };
        if (charge?.payment_intent) {
          const [tx] = await db
            .select()
            .from(transactions)
            .where(eq(transactions.providerPaymentId, charge.payment_intent))
            .limit(1);
          if (tx) {
            const refundedAmount = charge.amount_refunded ?? charge.amount ?? 0;
            const status =
              event.type === "charge.dispute.created"
                ? "disputed"
                : refundedAmount > 0 && refundedAmount < tx.amountCents
                  ? "partially_refunded"
                  : "refunded";
            await db
              .update(transactions)
              .set({
                status,
                refundedAmountCents: refundedAmount,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              })
              .where(eq(transactions.id, tx.id));
            if (status === "refunded" || status === "disputed") {
              await db
                .update(entitlements)
                .set({
                  status: "revoked",
                  reason: event.type,
                  updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(entitlements.transactionId, tx.id), eq(entitlements.status, "active")));
            }
          }
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
