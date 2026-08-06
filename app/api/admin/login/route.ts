import { NextRequest, NextResponse } from "next/server";
import { loginAdmin } from "../../../../lib/admin-data";
import { sessionCookieHeader } from "../../../../lib/admin-auth";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim() || "";
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const result = await loginAdmin(email, password);
    if (!result) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }
    const response = NextResponse.json({
      ok: true,
      email: result.admin.email,
      role: result.admin.role,
    });
    response.headers.set(
      "Set-Cookie",
      sessionCookieHeader(result.token, request.nextUrl.protocol === "https:"),
    );
    return response;
  } catch (error) {
    console.error("admin login failed", error);
    return NextResponse.json(
      { error: "Admin database is unavailable. Check D1 binding and bootstrap env." },
      { status: 503 },
    );
  }
}
