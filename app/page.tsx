import { formatPlanPrice, resolveLivePlan } from "../lib/live-pricing";
import { FormBatch } from "./FormBatch";

export default async function HomePage() {
  const plan = await resolveLivePlan();
  return (
    <FormBatch
      initialPricing={{
        amountCents: plan.amountCents,
        currency: plan.currency,
        durationDays: plan.durationDays,
        freeGenerationLimit: plan.freeGenerationLimit,
        displayPrice: formatPlanPrice(plan.amountCents, plan.currency),
      }}
    />
  );
}
