import { NextRequest, NextResponse } from "next/server";
import { parseCookies, readSessionToken, SESSION_COOKIE } from "./lib/admin-auth";
import { LLMS_TXT } from "./lib/llms-txt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/llms.txt") {
    return new NextResponse(LLMS_TXT, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

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
  matcher: ["/llms.txt", "/admin", "/admin/:path*"],
};
