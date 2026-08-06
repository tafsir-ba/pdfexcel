import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, ArrowRight, Sparkles } from "lucide-react";
import { pricingTiers } from "@/data/mockData";
import { PrivacyBadge } from "@/components/PrivacyBadge";

export default function Pricing() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-brand">Pricing</span>
        <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-ink text-balance sm:text-5xl">
          Simple pricing, priced per batch
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base text-ink-soft">
          Start free with 3 PDFs per batch. Upgrade only when you need to generate
          hundreds at a time.
        </p>
        <div className="mt-6 flex justify-center">
          <PrivacyBadge testId="pricing-privacy-badge" />
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3 md:items-start">
        {pricingTiers.map((t, i) => (
          <motion.div
            key={t.key}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            data-testid={`pricing-card-${t.key}`}
            className={`relative flex flex-col rounded-3xl border p-7 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 ${
              t.highlight
                ? "border-brand bg-ink text-white shadow-lift md:-mt-4 md:pb-10 md:pt-10"
                : "border-line bg-white text-ink shadow-soft hover:shadow-medium"
            }`}
          >
            {t.highlight && (
              <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-grass px-3.5 py-1.5 text-xs font-semibold text-white shadow-medium">
                <Sparkles className="h-3.5 w-3.5" /> Most popular
              </span>
            )}

            <h3 className={`font-heading text-lg font-bold ${t.highlight ? "text-white" : "text-ink"}`}>
              {t.name}
            </h3>
            <p className={`mt-1 text-sm ${t.highlight ? "text-white/70" : "text-ink-soft"}`}>{t.tagline}</p>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-heading text-4xl font-bold tracking-tight">{t.price}</span>
              <span className={`text-sm ${t.highlight ? "text-white/60" : "text-ink-muted"}`}>/{t.cadence}</span>
            </div>

            <Link
              to="/app"
              data-testid={`pricing-cta-${t.key}`}
              className={`mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold transition-[transform,background-color] duration-200 hover:-translate-y-0.5 active:scale-95 ${
                t.highlight
                  ? "bg-grass text-white shadow-medium hover:bg-grass-hover"
                  : "bg-brand text-white shadow-medium hover:bg-brand-hover"
              }`}
            >
              {t.cta} <ArrowRight className="h-4 w-4" />
            </Link>

            <ul className="mt-7 space-y-3.5">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${t.highlight ? "bg-grass/20 text-grass" : "bg-grass-light text-grass"}`}>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className={t.highlight ? "text-white/85" : "text-ink-soft"}>{f}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </div>

      <p className="mt-12 text-center text-sm text-ink-muted">
        All plans process files 100% locally. Prices shown for demo purposes.
      </p>
    </div>
  );
}
