import Link from "next/link";
import { formatPlanPrice, resolveLivePlan } from "../../lib/live-pricing";

export default async function TermsPage() {
  const plan = await resolveLivePlan();
  const price = formatPlanPrice(plan.amountCents, plan.currency);

  return (
    <main className="legal-page">
      <Link className="back-link" href="/">← Back to PDF Batch</Link>
      <h1>Terms</h1>
      <p className="legal-updated">Effective August 6, 2026</p>
      <h2>Service</h2>
      <p>PDF Batch fills supported PDF form fields and detected writing areas using recipient data from a CSV exported by Excel, Google Sheets, or another spreadsheet application. It produces a downloadable archive of individual PDFs — one completed PDF per spreadsheet row. Customers remain responsible for reviewing generated documents before relying on or distributing them.</p>
      <h2>Paid access</h2>
      <p>A {price} payment unlocks unlimited batches of up to 250 rows for {plan.durationDays} days. After payment you create an access account with the email used at Stripe checkout and a password you choose. That account restores paid access on any device during the paid period. PDF and CSV file contents remain in your browser and are never uploaded. The first {plan.freeGenerationLimit} generated PDFs per batch are available without payment.</p>
      <h2>Acceptable use</h2>
      <p>Do not use PDF Batch for unlawful activity, fraud, impersonation, unauthorized document creation, or processing data you do not have the right to use.</p>
      <h2>Refunds</h2>
      <p>If a completed payment does not unlock the advertised service, request a refund using the support details on the Stripe receipt. Refund requests should be made within seven days of purchase.</p>
      <h2>Limitations</h2>
      <p>The service supports fillable AcroForm PDFs and printed forms with detectable writing areas. Scanned documents and unusual layouts may not be detected correctly. The service is provided as-is and should not be used as the sole system of record for legal, financial, medical, or regulatory documents.</p>
    </main>
  );
}
