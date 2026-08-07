import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_NAME } from "../../lib/site";

type Faq = { question: string; answer: string };

type Props = {
  eyebrow?: string;
  title: string;
  lead: string;
  children: ReactNode;
  faqs?: Faq[];
  ctaHref?: string;
  ctaLabel?: string;
};

export function MarketingPage({
  eyebrow = "PDF Batch",
  title,
  lead,
  children,
  faqs,
  ctaHref = "/#tool",
  ctaLabel = "Start free preview",
}: Props) {
  const faqLd =
    faqs && faqs.length
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }
      : null;

  return (
    <main className="marketing-page">
      {faqLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      ) : null}
      <header className="marketing-top">
        <Link className="brand marketing-brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            PB
          </span>
          <span>{SITE_NAME}</span>
        </Link>
        <nav className="marketing-nav" aria-label="Product">
          <Link href="/pricing">Pricing</Link>
          <Link href="/security">Security</Link>
          <Link href="/#tool">Open tool</Link>
        </nav>
      </header>

      <section className="marketing-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="marketing-lead">{lead}</p>
        <p className="marketing-actions">
          <Link className="hero-cta" href={ctaHref}>
            {ctaLabel}
          </Link>
          <Link className="hero-cta-secondary" href="/pricing">
            See pricing
          </Link>
        </p>
      </section>

      <div className="marketing-body">{children}</div>

      {faqs?.length ? (
        <section className="marketing-faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading">Common questions</h2>
          <dl>
            {faqs.map((faq) => (
              <div key={faq.question} className="marketing-faq-item">
                <dt>{faq.question}</dt>
                <dd>{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <footer className="marketing-footer">
        <nav aria-label="Site">
          <Link href="/">Home</Link>
          <Link href="/fill-pdf-from-excel">Excel</Link>
          <Link href="/fill-pdf-from-csv">CSV</Link>
          <Link href="/bulk-fill-pdf-forms">Bulk fill</Link>
          <Link href="/mail-merge-pdf">Mail merge</Link>
          <Link href="/generate-certificates-from-excel">Certificates</Link>
          <Link href="/about">About</Link>
          <Link href="/security">Security</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/changelog">Changelog</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
