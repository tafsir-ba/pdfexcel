import { NextRequest, NextResponse } from "next/server";
import { withAdminDb } from "../../../../lib/admin-data";
import {
  listCustomerBatches,
  requirePaidCustomer,
  saveCustomerBatch,
} from "../../../../lib/customer-workspace";

/** List generated batches saved to the paid account. */
export async function GET(request: NextRequest) {
  try {
    const outcome = await withAdminDb(async (db) => {
      const auth = await requirePaidCustomer(db, request);
      if ("error" in auth) {
        return { kind: "auth" as const, error: auth.error, status: auth.status };
      }
      const batches = await listCustomerBatches(auth.customer.id);
      return { kind: "ok" as const, batches };
    });
    if (outcome.kind === "auth") {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true, batches: outcome.batches });
  } catch (error) {
    console.error("Batch list failed", error);
    return NextResponse.json({ error: "Saved batches could not be listed." }, { status: 500 });
  }
}

/** Store a generated ZIP on the paid account for later re-download. */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const pdfCount = Number(form.get("pdfCount") || 0);
    const kindRaw = String(form.get("kind") || "complete");
    const kind = kindRaw === "preview" ? "preview" : "complete";
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "ZIP file is required." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const filename =
      typeof File !== "undefined" && file instanceof File && file.name
        ? file.name
        : "pdf-batch.zip";
    const outcome = await withAdminDb(async (db) => {
      const auth = await requirePaidCustomer(db, request);
      if ("error" in auth) {
        return { kind: "auth" as const, error: auth.error, status: auth.status };
      }
      const record = await saveCustomerBatch(auth.customer.id, {
        filename,
        pdfCount,
        kind,
        bytes,
      });
      return { kind: "ok" as const, record };
    });

    if (outcome.kind === "auth") {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true, batch: outcome.record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Batch could not be saved.";
    console.error("Batch save failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
