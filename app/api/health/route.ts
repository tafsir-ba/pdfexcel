import { NextResponse } from "next/server";

/** Lightweight liveness probe for nginx / uptime checks (no DB). */
export async function GET() {
  return NextResponse.json({ ok: true, service: "pdf-batch" }, { status: 200 });
}
