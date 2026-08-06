import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="back-link" href="/">← Back to PDF Mail Merge</Link>
      <h1>Privacy</h1>
      <p className="legal-updated">Effective August 6, 2026</p>
      <h2>Files</h2>
      <p>PDF and spreadsheet contents are processed locally in your browser. PDF Mail Merge does not upload, receive, or store the contents of those files.</p>
      <h2>Workspace recovery</h2>
      <p>Immediately before checkout, the browser stores your current PDF, CSV, and field mapping in local device storage so the workspace can be restored after Stripe redirects you back. You can clear this data through your browser settings.</p>
      <h2>Payments</h2>
      <p>Stripe processes payment information. PDF Mail Merge receives only the checkout status and identifiers required to unlock paid access on the purchasing device.</p>
      <h2>Analytics</h2>
      <p>The initial release does not use third-party behavioral analytics or advertising trackers. Basic hosting logs may record standard request information such as IP address, browser type, and requested URL.</p>
      <h2>Contact</h2>
      <p>Payment receipts and billing support are handled through the contact details shown by Stripe at checkout.</p>
    </main>
  );
}
