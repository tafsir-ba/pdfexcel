import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { PRODUCT_FACTS } from "../../lib/site";

export const metadata: Metadata = {
  title: "Bulk Fill PDF Forms from a Spreadsheet",
  description:
    "Bulk-fill hundreds of PDF forms from one template and spreadsheet. Up to 250 PDFs per batch. No Acrobat required.",
  alternates: { canonical: "/bulk-fill-pdf-forms" },
};

const faqs = [
  {
    question: "Is this the same as merging PDFs?",
    answer:
      "No. PDF Batch fills the same template many times — once per spreadsheet row — then zips the individual PDFs. It does not stitch unrelated PDFs into one file.",
  },
  {
    question: "Do I need Acrobat Pro?",
    answer: "No. Mapping, preview, and generation run in the browser with PDF Batch.",
  },
];

export default function BulkFillPdfFormsPage() {
  return (
    <MarketingPage
      eyebrow="Bulk PDF filling"
      title="Bulk fill PDF forms from a spreadsheet"
      lead={`Generate up to ${PRODUCT_FACTS.maxRowsPerBatch} personalized PDFs per batch from one template. Preview ${PRODUCT_FACTS.freePreviewPdfs} free, then unlock unlimited batches when you need the full pack.`}
      faqs={faqs}
    >
      <h2>Direct answer</h2>
      <p>
        The simplest way to batch-fill a PDF form from Excel or CSV is to map fields once, verify a few rows, then
        generate the whole batch. PDF Batch is built for that workflow — not for general PDF editing or compression.
      </p>

      <h2>When bulk fill helps</h2>
      <ul>
        <li>HR or school certificates for an entire cohort</li>
        <li>Offer letters or invitations with shared layout</li>
        <li>Application or address forms repeated per person</li>
      </ul>

      <h2>Privacy in one line</h2>
      <p>
        Free preview stays in your browser. Paid access syncs workspace files and ZIP packs so you can reopen them
        during the paid period — see <Link href="/security">Security</Link> for retention details.
      </p>

      <h2>Related pages</h2>
      <div className="marketing-related">
        <Link href="/mail-merge-pdf">PDF mail merge</Link>
        <Link href="/fill-pdf-from-excel">From Excel</Link>
        <Link href="/generate-certificates-from-excel">Certificates from Excel</Link>
      </div>
    </MarketingPage>
  );
}
