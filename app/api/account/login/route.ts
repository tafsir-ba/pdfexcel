import { NextRequest, NextResponse } from "next/server";
import { withAdminDb } from "../../../../lib/admin-data";
import {
  authenticateCustomer,
  bindCustomerDevice,
  findActiveEntitlementByEmail,
} from "../../../../lib/customer-access";
import {
  createCustomerSessionToken,
  customerSessionCookieHeader,
} from "../../../../lib/customer-auth";

/** Restore paid access on any device with the email + password set after checkout. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    deviceId?: string;
  };
  const email = body.email?.trim().toLowerCase() || "";
  const password = body.password || "";
  const deviceId = body.deviceId?.trim() || "";
  if (!email || !password || !deviceId || deviceId.length > 100) {
    return NextResponse.json({ error: "Email, password, and device id are required." }, { status: 400 });
  }

  try {
    const result = await withAdminDb(async (db) => {
      const customer = await authenticateCustomer(db, email, password);
      if (!customer) return { error: "Incorrect email or password.", status: 401 as const };

      const entitlement = await findActiveEntitlementByEmail(db, email);
      if (!entitlement) {
        return { error: "No active paid access was found for this account.", status: 402 as const };
      }

      await bindCustomerDevice(db, customer.id, email, deviceId);
      const token = await createCustomerSessionToken({ customerId: customer.id, email });
      return {
        email,
        expiresAt: new Date(entitlement.endsAt).getTime(),
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
  } catch (error) {
    console.error("Customer login failed", error);
    return NextResponse.json({ error: "Sign-in could not be completed." }, { status: 500 });
  }
}
