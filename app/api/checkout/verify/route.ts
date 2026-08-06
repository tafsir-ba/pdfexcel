import { NextRequest, NextResponse } from "next/server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
    created?: number;
    metadata?: { device_id?: string; product?: string };
    error?: { message?: string };
  };

  if (!stripeResponse.ok) {
    return NextResponse.json({ error: session.error?.message || "Payment could not be verified." }, { status: 502 });
  }

  const paid =
    session.payment_status === "paid" &&
    session.metadata?.device_id === deviceId &&
    session.metadata?.product === "formbatch_30_day_access";
  if (!paid) {
    return NextResponse.json({ paid: false, error: "No completed PDF Mail Merge payment was found." }, { status: 402 });
  }

  const createdAt = (session.created || Math.floor(Date.now() / 1000)) * 1000;
  const expiresAt = createdAt + THIRTY_DAYS_MS;
  if (expiresAt <= Date.now()) {
    return NextResponse.json(
      { paid: false, error: "This PDF Mail Merge payment has expired." },
      { status: 402 },
    );
  }

  return NextResponse.json({ paid: true, expiresAt });
}
