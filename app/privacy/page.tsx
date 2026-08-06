import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="back-link" href="/">← Back to PDF Batch</Link>
      <h1>Privacy</h1>
      <p className="legal-updated">Effective August 6, 2026</p>
      <h2>Free preview</h2>
      <p>
        Without a paid account, PDF and spreadsheet contents are processed locally in your browser for the free
        preview. Those free-preview file contents are not uploaded to PDF Batch servers.
      </p>
      <h2>Paid account files</h2>
      <p>
        When you purchase access and sign in, PDF Batch stores your PDF template, CSV spreadsheet, field mappings,
        and generated ZIP archives on your account so you can reopen and re-download them on any device during the
        paid period (typically 30 days). Files are removed when paid access ends or when retention cleanup runs after
        expiry.
      </p>
      <h2>Workspace recovery</h2>
      <p>
        Immediately before checkout, the browser also stores your current PDF, CSV, and field mapping in local device
        storage so the workspace can be restored after Stripe redirects you back. You can clear that local copy through
        your browser settings.
      </p>
      <h2>Payments and accounts</h2>
      <p>
        Stripe processes payment information and collects the email used for your receipt. PDF Batch stores that email,
        payment identifiers, an optional password hash, and the paid-account files described above so you can sign in
        and restore access on other devices during the paid period.
      </p>
      <h2>Account credentials</h2>
      <p>
        If you create an access account after checkout, your password is stored only as a one-way hash. Sign out clears
        the session cookie on that browser; it does not delete your entitlement or saved files while access remains
        active.
      </p>
      <h2>Analytics</h2>
      <p>
        The initial release does not use third-party behavioral analytics or advertising trackers. Basic hosting logs
        may record standard request information such as IP address, browser type, and requested URL. Admin observability
        stores generation metadata (counts and sanitized filenames), not file contents in the admin dashboard.
      </p>
      <h2>Contact</h2>
      <p>Payment receipts and billing support are handled through the contact details shown by Stripe at checkout.</p>
    </main>
  );
}
