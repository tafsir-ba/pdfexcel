import { NextRequest, NextResponse } from "next/server";
import { sha256Hex, sanitizeFilename } from "../../../lib/admin-auth";
import { withAdminDb, usageEvents, upsertCustomer } from "../../../lib/admin-data";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    deviceId?: string;
    eventType?: "free_preview" | "paid_batch" | "failed_generation";
    rowsProcessed?: number;
    pdfsGenerated?: number;
    templateFilename?: string;
    csvFilename?: string;
    zipFilename?: string;
    success?: boolean;
    errorCode?: string;
  };

  const deviceId = body.deviceId?.trim();
  if (!deviceId || deviceId.length > 100) {
    return NextResponse.json({ error: "Device id required." }, { status: 400 });
  }

  const eventType = body.eventType || "free_preview";
  const template = body.templateFilename?.slice(0, 180) || "";
  const csv = body.csvFilename?.slice(0, 180) || "";
  const zip = body.zipFilename?.slice(0, 180) || "";

  try {
    await withAdminDb(async (db) => {
      const customerId = await upsertCustomer(db, { deviceId });
      await db.insert(usageEvents).values({
        customerId,
        deviceId,
        eventType,
        rowsProcessed: Math.max(0, Math.min(1000, Number(body.rowsProcessed) || 0)),
        pdfsGenerated: Math.max(0, Math.min(1000, Number(body.pdfsGenerated) || 0)),
        templateFilenameHash: template ? await sha256Hex(template.toLowerCase()) : null,
        templateFilenameSanitized: template ? sanitizeFilename(template) : null,
        csvFilenameHash: csv ? await sha256Hex(csv.toLowerCase()) : null,
        csvFilenameSanitized: csv ? sanitizeFilename(csv) : null,
        zipFilenameSanitized: zip ? sanitizeFilename(zip) : null,
        success: body.success !== false,
        errorCode: body.errorCode?.slice(0, 80) || null,
        userAgent: request.headers.get("user-agent")?.slice(0, 240) || null,
      });
    });
  } catch (error) {
    console.error("usage event persist failed", error);
    // Soft-fail: generation must not break if observability storage is down.
    return NextResponse.json({ ok: false, stored: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true, stored: true });
}
