import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";
import { PRODUCT_FACTS } from "../../lib/site";

export const metadata: Metadata = {
  title: "Security & Data Handling",
  description:
    "How PDF Batch handles free-preview files, paid workspace storage, retention, deletion, and subprocessors.",
  alternates: { canonical: "/security" },
};

const faqs = [
  {
    question: "Are free-preview PDFs uploaded?",
    answer:
      "No. Without a paid account, PDF and spreadsheet contents for the free preview are processed in your browser and are not uploaded to PDF Batch servers.",
  },
  {
    question: "What is stored when I pay?",
    answer:
      "Your PDF template, CSV, field mappings, and generated ZIP archives are stored on your account so you can reopen and re-download them during the paid period.",
  },
  {
    question: "Is content used for AI training?",
    answer: PRODUCT_FACTS.training + ".",
  },
];

export default function SecurityPage() {
  return (
    <MarketingPage
      eyebrow="Security"
      title="How PDF Batch handles your files"
      lead="Clear rules for free preview vs paid sync — so you can decide what belongs in the browser and what you are willing to store on your account."
      faqs={faqs}
    >
      <h2>Fact sheet</h2>
      <table className="fact-table">
        <tbody>
          <tr>
            <th>Free preview processing</th>
            <td>{PRODUCT_FACTS.freePreviewProcessing}</td>
          </tr>
          <tr>
            <th>Paid storage</th>
            <td>{PRODUCT_FACTS.paidStorage}</td>
          </tr>
          <tr>
            <th>Retention</th>
            <td>
              Paid files remain available during the paid period (typically {PRODUCT_FACTS.paidDurationDaysDefault}{" "}
              days) and are removed when access ends or retention cleanup runs after expiry.
            </td>
          </tr>
          <tr>
            <th>Immediate deletion</th>
            <td>
              Sign-out clears the browser session cookie. Removing files before expiry is handled through account/workspace
              controls while access is active; expired workspaces are cleaned up automatically.
            </td>
          </tr>
          <tr>
            <th>Payments</th>
            <td>Stripe processes cards and checkout email. PDF Batch stores entitlement and account records, not full card numbers.</td>
          </tr>
          <tr>
            <th>Subprocessors</th>
            <td>Stripe (payments). Hosting infrastructure for the web app and paid file storage.</td>
          </tr>
          <tr>
            <th>AI training</th>
            <td>{PRODUCT_FACTS.training}</td>
          </tr>
          <tr>
            <th>Admin observability</th>
            <td>Generation metadata (counts, sanitized filenames) — not PDF/CSV contents in the admin dashboard.</td>
          </tr>
        </tbody>
      </table>

      <p>
        Full narrative policy: <Link href="/privacy">Privacy</Link>. Service terms: <Link href="/terms">Terms</Link>.
      </p>
    </MarketingPage>
  );
}
