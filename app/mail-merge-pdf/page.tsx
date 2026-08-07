import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { PRODUCT_FACTS } from "../../lib/site";

export const metadata: Metadata = {
  title: "PDF Mail Merge from Spreadsheet",
  description:
    "PDF mail merge without Adobe Acrobat: map spreadsheet columns to PDF fields and download one filled PDF per row.",
  alternates: { canonical: "/mail-merge-pdf" },
};

const faqs = [
  {
    question: "How is this different from Word mail merge?",
    answer:
      "You start from an existing PDF form or printed layout instead of a Word document. PDF Batch fills PDF fields or writing boxes from CSV columns.",
  },
  {
    question: "Is there an Acrobat alternative for PDF mail merge?",
    answer:
      "Yes. PDF Batch is built specifically to batch-fill PDF forms from Excel or CSV without Acrobat Pro.",
  },
];

export default function MailMergePdfPage() {
  return (
    <MarketingPage
      eyebrow="PDF mail merge"
      title="PDF mail merge from a spreadsheet"
      lead="Map CSV or Excel columns to PDF fields once, preview any recipient, then generate a ZIP of individualized PDFs — a focused Acrobat alternative for form filling."
      faqs={faqs}
    >
      <h2>Direct answer</h2>
      <p>
        PDF mail merge here means: one PDF template + one spreadsheet → one completed PDF per row. Free preview covers{" "}
        {PRODUCT_FACTS.freePreviewPdfs} documents in your browser; paid access unlocks larger batches and account
        re-download.
      </p>

      <h2>What you get</h2>
      <ul>
        <li>Field mapping with live preview</li>
        <li>Optional bold, size, and alignment for printed writing boxes</li>
        <li>ZIP download with filenames driven by a spreadsheet column</li>
      </ul>

      <h2>Related pages</h2>
      <div className="marketing-related">
        <Link href="/bulk-fill-pdf-forms">Bulk fill PDF forms</Link>
        <Link href="/fill-pdf-from-csv">From CSV</Link>
        <Link href="/fill-pdf-from-excel">From Excel</Link>
        <Link href="/pricing">Pricing</Link>
      </div>
    </MarketingPage>
  );
}
