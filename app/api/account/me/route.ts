import { NextRequest, NextResponse } from "next/server";
import { withAdminDb } from "../../../../lib/admin-data";
import { findActiveEntitlementByEmail, findCustomerByEmail } from "../../../../lib/customer-access";
import {
  CUSTOMER_SESSION_COOKIE,
  readCustomerSessionToken,
} from "../../../../lib/customer-auth";
import { parseCookies } from "../../../../lib/admin-auth";

/** Current customer session + active paid access window (if any). */
export async function GET(request: NextRequest) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies[CUSTOMER_SESSION_COOKIE] || request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value;
  let session = null;
  try {
    session = await readCustomerSessionToken(token);
  } catch {
    session = null;
  }
  if (!session) {
    return NextResponse.json({ authenticated: false, hasAccess: false });
  }

  try {
    const access = await withAdminDb(async (db) => {
      const customer = await findCustomerByEmail(db, session.email);
      if (!customer || customer.id !== session.customerId) {
        return { authenticated: false, hasAccess: false };
      }
      const entitlement = await findActiveEntitlementByEmail(db, session.email);
      if (!entitlement) {
        return {
          authenticated: true,
          hasAccess: false,
          email: session.email,
          hasPassword: Boolean(customer.passwordHash),
        };
      }
      return {
        authenticated: true,
        hasAccess: true,
        email: session.email,
        expiresAt: new Date(entitlement.endsAt).getTime(),
        hasPassword: Boolean(customer.passwordHash),
      };
    });
    return NextResponse.json(access);
  } catch (error) {
    console.error("Account me failed", error);
    return NextResponse.json({ authenticated: false, hasAccess: false });
  }
}
