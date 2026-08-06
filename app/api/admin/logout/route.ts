import { NextResponse } from "next/server";
import { clearSessionCookieHeader } from "../../../../lib/admin-auth";
import { requireAdmin, writeAudit } from "../../../../lib/admin-data";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) {
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", clearSessionCookieHeader());
    return response;
  }
  await writeAudit(auth.db, {
    adminUserId: auth.session.adminId,
    actionType: "admin.logout",
    targetType: "admin_user",
    targetId: auth.session.adminId,
  });
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookieHeader());
  return response;
}
