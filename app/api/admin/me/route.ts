import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-data";
import { rolePermissions } from "../../../../lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  return NextResponse.json({
    email: auth.session.email,
    role: auth.session.role,
    permissions: rolePermissions(auth.session.role),
  });
}
