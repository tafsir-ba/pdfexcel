import { absoluteUrl, PRODUCT_FACTS, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../../lib/site";
import { formatPlanPrice, resolveLivePlan } from "../../lib/live-pricing";

/** JSON-LD for SoftwareApplication + Organization + Offer (homepage). */
export async function HomeJsonLd() {
  const plan = await resolveLivePlan();
  const price = formatPlanPrice(plan.amountCents, plan.currency).replace(/^\$/, "");
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        logo: absoluteUrl("/og.png"),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web browser",
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        image: absoluteUrl("/og.png"),
        offers: {
          "@type": "Offer",
          price,
          priceCurrency: plan.currency.toUpperCase(),
          description: `${plan.freeGenerationLimit} PDFs free preview; unlimited batches for ${plan.durationDays} days after purchase`,
          url: absoluteUrl("/pricing"),
        },
        featureList: [
          "Batch-fill PDF forms from Excel or CSV",
          `Up to ${PRODUCT_FACTS.maxRowsPerBatch} PDFs per batch`,
          "Live field mapping and row preview",
          "Free browser-local preview",
          "Paid account sync for templates and ZIP re-download",
          "AcroForm and printed writing-area support",
        ],
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
