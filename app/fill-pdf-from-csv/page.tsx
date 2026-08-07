import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { PRODUCT_FACTS } from "../../lib/site";

export const metadata: Metadata = {
  title: "Populate PDF Forms from CSV",
  description:
    "Upload a PDF template and a CSV spreadsheet to batch-fill forms. Map fields once, preview any row, download a ZIP of PDFs.",
  alternates: { canonical: "/fill-pdf-from-csv" },
};

const faqs = [
  {
    question: "What CSV encoding should I use?",
    answer:
      "UTF-8 CSV is best for accented names. PDF Batch also attempts common Windows encodings when needed.",
  },
  {
    question: "Can I name each output PDF from a column?",
    answer:
      "Yes. Choose a filename column (for example id or full_name) before generating so each file is easy to find in the ZIP.",
  },
];

export default function FillPdfFromCsvPage() {
  return (
    <MarketingPage
      eyebrow="CSV → PDF"
      title="Populate PDF forms from CSV"
      lead="Drop a fillable or printed PDF and a CSV of recipients. Map columns to fields, preview live, and download one PDF per row."
      faqs={faqs}
    >
      <h2>Direct answer</h2>
      <p>
        PDF Batch turns one PDF template plus one CSV into a ZIP of completed PDFs — one document per spreadsheet row.
        It is built for operators who already keep recipient data in spreadsheets.
      </p>

      <h2>Example</h2>
      <p>
        A housing attestation PDF with fields like NOM, Prénom, and Adresse maps to CSV columns such as host_nom,
        host_prenom, and host_adresse. Preview row 2, then generate the full batch when mappings look right.
      </p>

      <h2>Limits</h2>
      <ul>
        <li>{PRODUCT_FACTS.freePreviewPdfs} free preview PDFs per batch (browser-local).</li>
        <li>Up to {PRODUCT_FACTS.maxRowsPerBatch} rows per paid batch.</li>
        <li>Image-only scanned PDFs may need manual Add field placement.</li>
      </ul>

      <h2>Related pages</h2>
      <div className="marketing-related">
        <Link href="/fill-pdf-from-excel">Fill PDF forms from Excel</Link>
        <Link href="/bulk-fill-pdf-forms">Bulk fill PDF forms</Link>
        <Link href="/pricing">Pricing</Link>
      </div>
    </MarketingPage>
  );
}
