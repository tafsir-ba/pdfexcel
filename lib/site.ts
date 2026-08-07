/** Canonical public site URL and crawlable page inventory for SEO. */
export const SITE_URL = "https://pdfbatch.app";

export const SITE_NAME = "PDF Batch";

export const SITE_TAGLINE = "Batch fill PDF forms from Excel or CSV";

export const SITE_DESCRIPTION =
  "Upload a fillable PDF and an Excel or CSV file to generate one completed PDF per spreadsheet row. Preview three PDFs free. Paid access syncs templates and ZIP packs for re-download.";

/** Product limits used in marketing copy — keep aligned with FormBatch / live pricing defaults. */
export const PRODUCT_FACTS = {
  maxRowsPerBatch: 250,
  freePreviewPdfs: 3,
  paidDurationDaysDefault: 30,
  supportedInputs: ["PDF (AcroForm or printed writing areas)", "CSV from Excel or Google Sheets"],
  freePreviewProcessing: "In your browser — free-preview file contents are not uploaded",
  paidStorage: "PDF template, CSV, mappings, and generated ZIP archives on your account during the paid period",
  training: "File contents are not used to train AI models",
  api: "No public API yet",
} as const;

export type PublicPage = {
  path: string;
  title: string;
  description: string;
  priority?: number;
  changefreq?: "daily" | "weekly" | "monthly";
};

/** Every indexable public page (exclude /admin and /api). */
export const PUBLIC_PAGES: PublicPage[] = [
  {
    path: "/",
    title: "Batch Fill PDF Forms from Excel or CSV | PDF Batch",
    description: SITE_DESCRIPTION,
    priority: 1,
    changefreq: "weekly",
  },
  {
    path: "/fill-pdf-from-excel",
    title: "Fill PDF Forms from Excel | PDF Batch",
    description:
      "Export Excel to CSV, map columns to PDF fields, and generate one completed PDF per row. Free preview of three documents.",
    priority: 0.9,
  },
  {
    path: "/fill-pdf-from-csv",
    title: "Populate PDF Forms from CSV | PDF Batch",
    description:
      "Upload a PDF template and a CSV spreadsheet to batch-fill forms. Map fields once, preview any row, download a ZIP of PDFs.",
    priority: 0.9,
  },
  {
    path: "/bulk-fill-pdf-forms",
    title: "Bulk Fill PDF Forms from a Spreadsheet | PDF Batch",
    description:
      "Bulk-fill hundreds of PDF forms from one template and spreadsheet. Up to 250 PDFs per batch. No Acrobat required.",
    priority: 0.9,
  },
  {
    path: "/generate-certificates-from-excel",
    title: "Generate Certificates from Excel | PDF Batch",
    description:
      "Create personalized certificates or diplomas from an Excel export. One PDF per recipient, named from spreadsheet columns.",
    priority: 0.85,
  },
  {
    path: "/mail-merge-pdf",
    title: "PDF Mail Merge from Spreadsheet | PDF Batch",
    description:
      "PDF mail merge without Adobe Acrobat: map spreadsheet columns to PDF fields and download one filled PDF per row.",
    priority: 0.9,
  },
  {
    path: "/pricing",
    title: "Pricing | PDF Batch",
    description:
      "Preview three PDFs free in your browser. Unlock unlimited batches for a fixed paid period with account sync and ZIP re-download.",
    priority: 0.8,
  },
  {
    path: "/security",
    title: "Security & Data Handling | PDF Batch",
    description:
      "How PDF Batch handles free-preview files, paid workspace storage, retention, deletion, and subprocessors.",
    priority: 0.8,
  },
  {
    path: "/about",
    title: "About PDF Batch",
    description:
      "PDF Batch is the simplest way to batch-fill a PDF form from Excel or CSV — browser preview first, paid sync when you need it.",
    priority: 0.7,
  },
  {
    path: "/contact",
    title: "Contact | PDF Batch",
    description: "How to get billing support and product help for PDF Batch.",
    priority: 0.6,
  },
  {
    path: "/changelog",
    title: "Changelog | PDF Batch",
    description: "Recent product updates for PDF Batch: placement tools, orientation fixes, and account sync.",
    priority: 0.5,
    changefreq: "weekly",
  },
  {
    path: "/privacy",
    title: "Privacy | PDF Batch",
    description: "Privacy policy for free preview processing and paid account file storage.",
    priority: 0.5,
  },
  {
    path: "/terms",
    title: "Terms | PDF Batch",
    description: "Terms of service for PDF Batch paid access and acceptable use.",
    priority: 0.5,
  },
];

export function absoluteUrl(path: string) {
  if (path === "/") return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
