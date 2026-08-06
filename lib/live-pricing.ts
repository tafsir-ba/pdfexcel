import { withAdminDb, pricingPlans, and, eq } from "./admin-data";

export type LivePlan = {
  name: string;
  amountCents: number;
  currency: string;
  durationDays: number;
  freeGenerationLimit: number;
  productKey: string;
  description: string;
};

export const DEFAULT_LIVE_PLAN: LivePlan = {
  name: "PDF Mail Merge 30-day access",
  amountCents: 1900,
  currency: "usd",
  durationDays: 30,
  freeGenerationLimit: 3,
  productKey: "formbatch_30_day_access",
  description: "Unlimited spreadsheet-to-PDF mail merge batches on one device for 30 days",
};

export async function resolveLivePlan(): Promise<LivePlan> {
  try {
    return await withAdminDb(async (db) => {
      const [plan] = await db
        .select()
        .from(pricingPlans)
        .where(and(eq(pricingPlans.active, true), eq(pricingPlans.archived, false)))
        .limit(1);
      if (!plan) return DEFAULT_LIVE_PLAN;
      const durationDays = plan.durationDays || DEFAULT_LIVE_PLAN.durationDays;
      return {
        name: plan.name,
        amountCents: plan.amountCents,
        currency: plan.currency || "usd",
        durationDays,
        freeGenerationLimit: plan.freeGenerationLimit ?? DEFAULT_LIVE_PLAN.freeGenerationLimit,
        productKey: plan.productKey,
        description: `Unlimited spreadsheet-to-PDF mail merge batches on one device for ${durationDays} days`,
      };
    });
  } catch {
    return DEFAULT_LIVE_PLAN;
  }
}

/** Public display string, e.g. "$5" or "€19.50". */
export function formatPlanPrice(amountCents: number, currency: string) {
  const code = (currency || "usd").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `$${(amountCents / 100).toFixed(amountCents % 100 === 0 ? 0 : 2)}`;
  }
}
