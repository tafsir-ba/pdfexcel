import type { Metadata } from "next";
import { formatPlanPrice, resolveLivePlan } from "../lib/live-pricing";
import { HomeJsonLd } from "./components/HomeJsonLd";
import { FormBatch } from "./FormBatch";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const plan = await resolveLivePlan();
  return (
    <>
      <HomeJsonLd />
      <FormBatch
        initialPricing={{
          amountCents: plan.amountCents,
          currency: plan.currency,
          durationDays: plan.durationDays,
          freeGenerationLimit: plan.freeGenerationLimit,
          displayPrice: formatPlanPrice(plan.amountCents, plan.currency),
        }}
      />
    </>
  );
}
