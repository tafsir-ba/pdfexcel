// Mocked sample data used across the static PDF Batch redesign.
// No real PDF/CSV processing happens — everything here is illustrative.

export const csvFileName = "graduates_may_2026.csv";
export const pdfFileName = "certificate_of_completion.pdf";

export const csvColumns = [
  "full_name",
  "course_name",
  "completion_date",
  "certificate_id",
  "instructor",
  "email",
];

export const sampleRows = [
  {
    full_name: "Amara Okafor",
    course_name: "Advanced Data Privacy",
    completion_date: "May 12, 2026",
    certificate_id: "PB-10041",
    instructor: "Dr. Lena Ramos",
    email: "amara.okafor@example.com",
  },
  {
    full_name: "Julian Meyer",
    course_name: "Advanced Data Privacy",
    completion_date: "May 12, 2026",
    certificate_id: "PB-10042",
    instructor: "Dr. Lena Ramos",
    email: "julian.meyer@example.com",
  },
  {
    full_name: "Priya Nair",
    course_name: "Advanced Data Privacy",
    completion_date: "May 12, 2026",
    certificate_id: "PB-10043",
    instructor: "Dr. Lena Ramos",
    email: "priya.nair@example.com",
  },
  {
    full_name: "Tobias Andersen",
    course_name: "Advanced Data Privacy",
    completion_date: "May 12, 2026",
    certificate_id: "PB-10044",
    instructor: "Dr. Lena Ramos",
    email: "tobias.a@example.com",
  },
  {
    full_name: "Sofia Marín",
    course_name: "Advanced Data Privacy",
    completion_date: "May 12, 2026",
    certificate_id: "PB-10045",
    instructor: "Dr. Lena Ramos",
    email: "sofia.marin@example.com",
  },
  {
    full_name: "Kwame Boateng",
    course_name: "Advanced Data Privacy",
    completion_date: "May 12, 2026",
    certificate_id: "PB-10046",
    instructor: "Dr. Lena Ramos",
    email: "kwame.b@example.com",
  },
];

// PDF form fields with their default suggested CSV mapping.
export const pdfFields = [
  { id: "field_name", label: "Recipient Name", suggested: "full_name" },
  { id: "field_course", label: "Course Title", suggested: "course_name" },
  { id: "field_date", label: "Date Completed", suggested: "completion_date" },
  { id: "field_cert", label: "Certificate No.", suggested: "certificate_id" },
  { id: "field_signer", label: "Signed By", suggested: "instructor" },
];

export const useCases = [
  {
    key: "certificates",
    title: "Certificates",
    blurb: "Course completions, awards and diplomas — hundreds at once, each personalized.",
    icon: "Award",
  },
  {
    key: "letters",
    title: "Letters",
    blurb: "Offer letters, invitations and personalized notices generated from a single template.",
    icon: "Mail",
  },
  {
    key: "forms",
    title: "Application Forms",
    blurb: "Pre-fill address, membership and application forms directly from your spreadsheet.",
    icon: "FileText",
  },
];

export const trustStats = [
  { value: "0", label: "Files sent to a server", suffix: "" },
  { value: "100", label: "Processed in your browser", suffix: "%" },
  { value: "2.4", label: "Documents generated", suffix: "M+" },
  { value: "12", label: "Average batch time", suffix: "s" },
];

export const pricingTiers = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Perfect for a quick one-off batch.",
    highlight: false,
    cta: "Start for free",
    features: [
      "Up to 3 PDFs per batch",
      "Drag & drop PDF + CSV",
      "Live field mapping preview",
      "100% local processing",
      "Community support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$12",
    cadence: "per month",
    tagline: "For teams generating documents every week.",
    highlight: true,
    cta: "Go Pro",
    features: [
      "Unlimited PDFs per batch",
      "Reusable saved templates",
      "ZIP export with custom naming",
      "Priority in-browser engine",
      "Email support",
    ],
  },
  {
    key: "business",
    name: "Business",
    price: "$39",
    cadence: "per month",
    tagline: "Shared templates and controls for the whole office.",
    highlight: false,
    cta: "Contact sales",
    features: [
      "Everything in Pro",
      "Shared team template library",
      "Bulk merge from multiple sheets",
      "Audit-friendly local logs",
      "Dedicated support",
    ],
  },
];

export const faqs = [
  {
    q: "Where are my files processed?",
    a: "Entirely inside your browser. Your PDF and spreadsheet never leave your device — there is no upload step and nothing is stored on a server.",
  },
  {
    q: "What file types can I use?",
    a: "A fillable PDF form as your template, and a CSV or Excel (.xlsx) spreadsheet as your data source. Each row in the sheet becomes one filled PDF.",
  },
  {
    q: "How does field mapping work?",
    a: "PDF Batch reads the fillable fields in your PDF and lets you connect each one to a column from your spreadsheet. You preview any row before generating the full batch.",
  },
  {
    q: "Is there a limit on batch size?",
    a: "The Free plan generates up to 3 PDFs per batch. Pro and Business plans remove that limit so you can generate hundreds in one run.",
  },
  {
    q: "Do I need Adobe Acrobat?",
    a: "No. PDF Batch is a standalone web app — no Acrobat, no plugins, no installs. Just open it in your browser and go.",
  },
  {
    q: "Can I reuse a mapping later?",
    a: "On Pro and Business you can save a template with its field mapping, so recurring batches take seconds the next time around.",
  },
];
