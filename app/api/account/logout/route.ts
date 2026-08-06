import { NextResponse } from "next/server";
import { clearCustomerSessionCookieHeader } from "../../../../lib/customer-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearCustomerSessionCookieHeader());
  return response;
}
