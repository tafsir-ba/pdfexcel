import { NextRequest, NextResponse } from "next/server";
import { withAdminDb } from "../../../../../lib/admin-data";
import { readCustomerBatch, requirePaidCustomer } from "../../../../../lib/customer-workspace";

type RouteContext = { params: Promise<{ id: string }> };

/** Re-download a previously generated batch ZIP from the paid account. */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const outcome = await withAdminDb(async (db) => {
      const auth = await requirePaidCustomer(db, request);
      if ("error" in auth) {
        return { kind: "auth" as const, error: auth.error, status: auth.status };
      }
      const batch = await readCustomerBatch(auth.customer.id, id);
      if (!batch) return { kind: "missing" as const };
      return { kind: "ok" as const, batch };
    });

    if (outcome.kind === "auth") {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    if (outcome.kind === "missing") {
      return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(outcome.batch.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${outcome.batch.meta.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Batch download failed", error);
    return NextResponse.json({ error: "Batch could not be downloaded." }, { status: 500 });
  }
}
