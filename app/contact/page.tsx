import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to get billing support and product help for PDF Batch.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Contact"
      title="How to reach PDF Batch"
      lead="Billing support goes through Stripe. Product questions are best answered by trying the free preview with your own PDF and CSV."
      ctaLabel="Open the tool"
    >
      <h2>Billing and receipts</h2>
      <p>
        Payment receipts and billing support use the contact details shown by Stripe at checkout and on your receipt
        email. Include your checkout email and payment date so the entitlement can be located.
      </p>

      <h2>Product help</h2>
      <ul>
        <li>
          Start with the <Link href="/#tool">in-browser tool</Link> and the built-in sample.
        </li>
        <li>
          Read <Link href="/security">Security</Link> for upload and retention questions.
        </li>
        <li>
          Check the <Link href="/changelog">changelog</Link> for recent behavior changes.
        </li>
      </ul>

      <h2>Privacy requests</h2>
      <p>
        See the <Link href="/privacy">Privacy</Link> page for how free preview and paid account files are handled.
      </p>
    </MarketingPage>
  );
}
