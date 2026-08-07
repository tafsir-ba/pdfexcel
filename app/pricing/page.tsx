import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { formatPlanPrice, resolveLivePlan } from "../../lib/live-pricing";
import { PRODUCT_FACTS } from "../../lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Preview three PDFs free in your browser. Unlock unlimited batches for a fixed paid period with account sync and ZIP re-download.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const plan = await resolveLivePlan();
  const price = formatPlanPrice(plan.amountCents, plan.currency);

  const faqs = [
    {
      question: "What is free?",
      answer: `Each batch includes ${plan.freeGenerationLimit} preview PDFs processed in your browser. You can map fields and inspect output before paying.`,
    },
    {
      question: "What does paid unlock?",
      answer: `${price} unlocks unlimited batches of up to ${PRODUCT_FACTS.maxRowsPerBatch} rows for ${plan.durationDays} days, with account sign-in, workspace sync, and ZIP re-download under My files.`,
    },
  ];

  return (
    <MarketingPage
      eyebrow="Pricing"
      title="Simple paid access when the free preview is not enough"
      lead={`Start with ${plan.freeGenerationLimit} free preview PDFs. Unlock unlimited batches for ${plan.durationDays} days when you need the full pack.`}
      faqs={faqs}
      ctaHref="/#tool"
      ctaLabel="Try the free preview"
    >
      <h2>Plans</h2>
      <table className="fact-table">
        <tbody>
          <tr>
            <th>Free preview</th>
            <td>
              {plan.freeGenerationLimit} PDFs per batch · browser-local processing · field mapping and live preview
            </td>
          </tr>
          <tr>
            <th>Paid access</th>
            <td>
              {price} for {plan.durationDays} days · unlimited batches · up to {PRODUCT_FACTS.maxRowsPerBatch} rows each ·
              account restore · synced templates and ZIP packs
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Fact sheet</h2>
      <table className="fact-table">
        <tbody>
          <tr>
            <th>Max rows per batch</th>
            <td>{PRODUCT_FACTS.maxRowsPerBatch}</td>
          </tr>
          <tr>
            <th>Free allowance</th>
            <td>{plan.freeGenerationLimit} generated PDFs per batch</td>
          </tr>
          <tr>
            <th>Inputs</th>
            <td>PDF + CSV (Excel / Google Sheets export)</td>
          </tr>
          <tr>
            <th>API</th>
            <td>{PRODUCT_FACTS.api}</td>
          </tr>
        </tbody>
      </table>

      <p>
        Billing is processed by Stripe. See <Link href="/terms">Terms</Link> and{" "}
        <Link href="/security">Security</Link> for retention and file handling.
      </p>
    </MarketingPage>
  );
}
