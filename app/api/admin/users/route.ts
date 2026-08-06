import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  writeAudit,
  adminUsers,
  eq,
  desc,
} from "../../../../lib/admin-data";
import { hashPassword, type AdminRole } from "../../../../lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  if (auth.session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const users = await auth.db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
      active: adminUsers.active,
      createdAt: adminUsers.createdAt,
    })
    .from(adminUsers)
    .orderBy(desc(adminUsers.createdAt));
  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth instanceof Response) return auth;
  if (auth.session.role !== "owner") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: "create" | "deactivate";
    email?: string;
    password?: string;
    role?: AdminRole;
    id?: number;
    reason?: string;
  };

  if (body.action === "create") {
    if (!body.email || !body.password || !body.role) {
      return NextResponse.json({ error: "email, password, role required." }, { status: 400 });
    }
    const inserted = await auth.db
      .insert(adminUsers)
      .values({
        email: body.email.trim().toLowerCase(),
        passwordHash: await hashPassword(body.password),
        role: body.role,
        active: true,
      })
      .returning({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role });
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "admin_user.create",
      targetType: "admin_user",
      targetId: inserted[0].id,
      reason: body.reason || null,
    });
    return NextResponse.json({ user: inserted[0] });
  }

  if (body.action === "deactivate" && body.id) {
    await auth.db.update(adminUsers).set({ active: false }).where(eq(adminUsers.id, body.id));
    await writeAudit(auth.db, {
      adminUserId: auth.session.adminId,
      actionType: "admin_user.deactivate",
      targetType: "admin_user",
      targetId: body.id,
      reason: body.reason || null,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
