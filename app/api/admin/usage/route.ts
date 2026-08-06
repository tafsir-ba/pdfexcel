import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, usageEvents, desc } from "../../../../lib/admin-data";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "usage:read");
  if (auth instanceof Response) return auth;
  const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  let rows = await auth.db.select().from(usageEvents).orderBy(desc(usageEvents.createdAt)).limit(300);
  if (q) {
    rows = rows.filter(
      (row) =>
        row.deviceId?.toLowerCase().includes(q) ||
        row.templateFilenameSanitized?.toLowerCase().includes(q) ||
        row.csvFilenameSanitized?.toLowerCase().includes(q),
    );
  }
  return NextResponse.json({
    privacyNote: "Admin views never show file contents. Only hashed/sanitized filenames and counts are kept.",
    events: rows,
  });
}
