import { NextRequest, NextResponse } from "next/server";
import { parseCookies, readSessionToken, SESSION_COOKIE } from "./lib/admin-auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login") return NextResponse.next();

  const cookies = parseCookies(request.headers.get("cookie"));
  let session = null;
  try {
    session = await readSessionToken(cookies[SESSION_COOKIE] || request.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    session = null;
  }
  if (!session) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
