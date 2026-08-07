import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { PRODUCT_FACTS } from "../../lib/site";

export const metadata: Metadata = {
  title: "Generate Certificates from Excel",
  description:
    "Create personalized certificates or diplomas from an Excel export. One PDF per recipient, named from spreadsheet columns.",
  alternates: { canonical: "/generate-certificates-from-excel" },
};

const faqs = [
  {
    question: "My diploma PDF has no auto-detected fields. Can I still use it?",
    answer:
      "Yes. Use Add field on the preview, place boxes on the writing lines, map them to Excel columns, then generate. Image-only PDFs often need this manual step.",
  },
  {
    question: "Can output filenames use the recipient name?",
    answer: "Yes. Pick a filename column such as full_name or certificate_id before you generate.",
  },
];

export default function GenerateCertificatesPage() {
  return (
    <MarketingPage
      eyebrow="Certificates & diplomas"
      title="Generate certificates from Excel"
      lead="Turn one certificate template and an Excel recipient list into hundreds of personalized PDFs — without filling them one by one."
      faqs={faqs}
    >
      <h2>Direct answer</h2>
      <p>
        Export your Excel roster to CSV, upload your certificate PDF, map name / course / date fields, preview a few
        graduates, then download a ZIP with one certificate per row (up to {PRODUCT_FACTS.maxRowsPerBatch} per batch).
      </p>

      <h2>Tips for clean certificates</h2>
      <ul>
        <li>Prefer a text-based or AcroForm PDF when you can — auto-detection works better than on flat scans.</li>
        <li>Set font size and alignment on each writing box so long names still fit.</li>
        <li>Use the sample on the homepage to rehearse the flow before your production file.</li>
      </ul>

      <h2>Related pages</h2>
      <div className="marketing-related">
        <Link href="/fill-pdf-from-excel">Fill PDF from Excel</Link>
        <Link href="/bulk-fill-pdf-forms">Bulk fill PDF forms</Link>
        <Link href="/security">Security & retention</Link>
      </div>
    </MarketingPage>
  );
}
