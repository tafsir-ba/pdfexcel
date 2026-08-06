import { NextResponse } from "next/server";
import { formatPlanPrice, resolveLivePlan } from "../../../lib/live-pricing";

/** Public live pricing for the marketing site + CTA. No auth. */
export async function GET() {
  const plan = await resolveLivePlan();
  return NextResponse.json(
    {
      name: plan.name,
      amountCents: plan.amountCents,
      currency: plan.currency,
      durationDays: plan.durationDays,
      freeGenerationLimit: plan.freeGenerationLimit,
      displayPrice: formatPlanPrice(plan.amountCents, plan.currency),
      productKey: plan.productKey,
    },
    {
      headers: {
        // Short cache so admin price changes show up quickly without hammering SQLite.
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
