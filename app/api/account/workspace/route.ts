import { NextRequest, NextResponse } from "next/server";
import { withAdminDb } from "../../../../lib/admin-data";
import {
  loadCustomerWorkspace,
  requirePaidCustomer,
  saveCustomerWorkspace,
  workspaceSummary,
  type WorkspacePayload,
} from "../../../../lib/customer-workspace";

/** Load saved template/CSV workspace for the signed-in paid account. */
export async function GET(request: NextRequest) {
  try {
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
    const outcome = await withAdminDb(async (db) => {
      const auth = await requirePaidCustomer(db, request);
      if ("error" in auth) {
        return { kind: "auth" as const, error: auth.error, status: auth.status };
      }
      if (summaryOnly) {
        return { kind: "summary" as const, summary: await workspaceSummary(auth.customer.id) };
      }
      const workspace = await loadCustomerWorkspace(auth.customer.id);
      if (!workspace) return { kind: "empty" as const };
      return { kind: "workspace" as const, workspace };
    });

    if (outcome.kind === "auth") {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    if (outcome.kind === "empty") {
      return NextResponse.json({ empty: true }, { status: 404 });
    }
    if (outcome.kind === "summary") {
      return NextResponse.json({ ok: true, ...outcome.summary });
    }
    return NextResponse.json({ ok: true, workspace: outcome.workspace });
  } catch (error) {
    console.error("Workspace load failed", error);
    return NextResponse.json({ error: "Saved files could not be loaded." }, { status: 500 });
  }
}

/** Save PDF/CSV + mapping to the paid account for cross-device restore. */
export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as WorkspacePayload | null;
  if (!body?.pdfBase64 || !body?.csvBase64 || !body.pdfName || !body.csvName || typeof body.mapping !== "object") {
    return NextResponse.json({ error: "PDF, CSV, and mapping are required." }, { status: 400 });
  }

  try {
    const outcome = await withAdminDb(async (db) => {
      const auth = await requirePaidCustomer(db, request);
      if ("error" in auth) {
        return { kind: "auth" as const, error: auth.error, status: auth.status };
      }
      const meta = await saveCustomerWorkspace(db, auth.customer.id, body);
      return { kind: "saved" as const, meta };
    });

    if (outcome.kind === "auth") {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true, updatedAt: outcome.meta.updatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Saved files could not be stored.";
    console.error("Workspace save failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
