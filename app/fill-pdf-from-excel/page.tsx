import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { PRODUCT_FACTS } from "../../lib/site";

export const metadata: Metadata = {
  title: "Fill PDF Forms from Excel",
  description:
    "Export Excel to CSV, map columns to PDF fields, and generate one completed PDF per row. Free preview of three documents.",
  alternates: { canonical: "/fill-pdf-from-excel" },
};

const faqs = [
  {
    question: "Does PDF Batch open Excel files directly?",
    answer:
      "Upload a CSV export from Excel (File → Save As → CSV, or Download → CSV). That keeps column mapping reliable across Excel versions.",
  },
  {
    question: "How many certificates or forms can I generate from one spreadsheet?",
    answer: `Each batch supports up to ${PRODUCT_FACTS.maxRowsPerBatch} rows. Split larger workbooks into multiple CSVs if needed.`,
  },
  {
    question: "Do free-preview files leave my computer?",
    answer:
      "No. Free preview processing stays in your browser. Paid accounts optionally sync the template, CSV, mappings, and ZIP archives for re-download during the paid period.",
  },
];

export default function FillPdfFromExcelPage() {
  return (
    <MarketingPage
      eyebrow="Excel → PDF"
      title="Fill PDF forms from Excel"
      lead="Export your Excel sheet to CSV, upload a PDF template, map columns to fields once, then generate one completed PDF per spreadsheet row."
      faqs={faqs}
    >
      <h2>Direct answer</h2>
      <p>
        PDF Batch is a browser tool for batch-filling PDF forms from Excel data. You do not need Adobe Acrobat.
        Map each PDF field to an Excel column (via CSV), preview any row, then download a ZIP of filled PDFs.
      </p>

      <h2>Working flow</h2>
      <ul>
        <li>Save or export the Excel sheet as CSV (UTF-8 when possible).</li>
        <li>Upload the PDF form and the CSV on the PDF Batch tool.</li>
        <li>Confirm auto-mapped fields; fix any remaining mappings manually.</li>
        <li>Preview a few rows, then generate the batch and download the ZIP.</li>
      </ul>

      <h2>Supported inputs and limits</h2>
      <ul>
        <li>PDF: AcroForm fillable fields or printed writing areas (underscores, dotted lines, rules).</li>
        <li>Spreadsheet: CSV exported from Excel or Google Sheets.</li>
        <li>Free preview: {PRODUCT_FACTS.freePreviewPdfs} PDFs per batch in the browser.</li>
        <li>Paid batches: up to {PRODUCT_FACTS.maxRowsPerBatch} PDFs per run.</li>
      </ul>

      <h2>Related pages</h2>
      <div className="marketing-related">
        <Link href="/fill-pdf-from-csv">Populate PDF forms from CSV</Link>
        <Link href="/generate-certificates-from-excel">Generate certificates from Excel</Link>
        <Link href="/mail-merge-pdf">PDF mail merge without Acrobat</Link>
        <Link href="/security">How free vs paid file handling works</Link>
      </div>
    </MarketingPage>
  );
}
