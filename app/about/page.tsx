import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { PRODUCT_FACTS, SITE_TAGLINE } from "../../lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "PDF Batch is the simplest way to batch-fill a PDF form from Excel or CSV — browser preview first, paid sync when you need it.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow="About"
      title="Built for one job: batch-fill PDF forms"
      lead={SITE_TAGLINE + ". Not a general PDF editor — a focused mail-merge style workflow for forms, certificates, and letters."}
    >
      <h2>Who it is for</h2>
      <p>
        Operators who already keep recipient data in Excel or Google Sheets and need personalized PDFs without clicking
        through Acrobat for every row.
      </p>

      <h2>Category we own</h2>
      <p>
        The simplest way to batch-fill a PDF form from Excel or CSV. Free preview stays local; paid access keeps
        templates and ZIP packs available for re-download during the paid period.
      </p>

      <h2>Product snapshot</h2>
      <ul>
        <li>Up to {PRODUCT_FACTS.maxRowsPerBatch} PDFs per batch</li>
        <li>{PRODUCT_FACTS.freePreviewPdfs} free preview PDFs</li>
        <li>AcroForm + printed writing-area support; manual fields when detection cannot help</li>
      </ul>

      <h2>Learn more</h2>
      <div className="marketing-related">
        <Link href="/security">Security & data handling</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/changelog">Changelog</Link>
        <Link href="/contact">Contact</Link>
      </div>
    </MarketingPage>
  );
}
