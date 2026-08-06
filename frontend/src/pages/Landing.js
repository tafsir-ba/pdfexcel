import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Award, Mail, FileText, Lock, Zap, MousePointerClick,
  Upload, GitMerge, Download, Sparkles, ShieldCheck,
} from "lucide-react";
import { HeroDemo } from "@/components/HeroDemo";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { trustStats, useCases } from "@/data/mockData";

const iconMap = { Award, Mail, FileText };

const steps = [
  { icon: Upload, title: "Drop your files", body: "Add a fillable PDF and a CSV or Excel sheet. Everything stays on your device." },
  { icon: GitMerge, title: "Map the fields", body: "Connect each PDF field to a spreadsheet column and preview any row live." },
  { icon: Download, title: "Download the batch", body: "Generate one PDF per row and grab them all in a single ZIP file." },
];

const fade = {
  hidden: { opacity: 0, y: 20 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" } }),
};

export default function Landing() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-[-10rem] h-[30rem] w-[30rem] rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-32 top-20 h-[22rem] w-[22rem] rounded-full bg-grass/10 blur-3xl" />

        <div className="mx-auto max-w-7xl px-5 pb-16 pt-14 md:px-8 md:pb-24 md:pt-20">
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-12">
            <motion.div initial="hidden" animate="show" variants={fade} className="md:col-span-5">
              <PrivacyBadge testId="hero-privacy-badge" />
              <h1 className="mt-5 font-heading text-4xl font-bold leading-[1.05] tracking-tight text-ink text-balance sm:text-5xl lg:text-6xl">
                Fill hundreds of PDFs from a spreadsheet.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-ink-soft md:text-lg">
                Certificates, letters and forms — batch-filled in seconds, right
                inside your browser. No uploads, no Acrobat, no waiting.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/app"
                  data-testid="hero-cta-primary"
                  className="group inline-flex items-center gap-2 rounded-full bg-grass px-6 py-3.5 text-sm font-semibold text-white shadow-medium transition-[transform,background-color] duration-200 hover:bg-grass-hover hover:-translate-y-0.5 active:scale-95"
                >
                  Generate my batch
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  to="/app"
                  data-testid="hero-cta-sample"
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-6 py-3.5 text-sm font-semibold text-ink shadow-soft transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-ink/30 active:scale-95"
                >
                  <MousePointerClick className="h-4 w-4 text-brand" />
                  Try the sample
                </Link>
              </div>

              <div className="mt-8 flex items-center gap-5 text-xs text-ink-soft">
                <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-brand" /> Instant preview</span>
                <span className="inline-flex items-center gap-1.5"><Lock className="h-4 w-4 text-grass" /> Nothing uploaded</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
              className="md:col-span-7"
            >
              <HeroDemo />
            </motion.div>
          </div>
        </div>
      </section>

      {/* TRUST STATS */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-5 py-10 md:grid-cols-4 md:px-8">
          {trustStats.map((s, i) => (
            <motion.div
              key={s.label}
              initial="hidden" whileInView="show" viewport={{ once: true }} custom={i} variants={fade}
              data-testid={`trust-stat-${i}`}
              className="text-center md:text-left"
            >
              <div className="font-heading text-3xl font-bold tracking-tight text-ink md:text-4xl">
                <span className={i === 0 ? "text-grass" : ""}>{s.value}</span><span className="text-brand">{s.suffix}</span>
              </div>
              <div className="mt-1 text-xs text-ink-soft md:text-sm">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
        <div className="max-w-2xl">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-brand">How it works</span>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-ink md:text-4xl">
            Three steps, zero learning curve
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial="hidden" whileInView="show" viewport={{ once: true }} custom={i} variants={fade}
              data-testid={`how-step-${i}`}
              className="group relative rounded-2xl border border-line bg-white p-7 shadow-soft transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-medium"
            >
              <span className="absolute right-6 top-6 font-heading text-4xl font-bold text-line">
                0{i + 1}
              </span>
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-ink text-white transition-transform duration-200 group-hover:scale-105">
                <s.icon className="h-6 w-6" strokeWidth={2} />
              </span>
              <h3 className="mt-5 font-heading text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* USE CASES */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-brand">Use cases</span>
              <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight text-ink md:text-4xl">
                One template. Any document.
              </h2>
            </div>
            <Link to="/app" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-brand-hover">
              Explore the flow <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {useCases.map((u, i) => {
              const Icon = iconMap[u.icon];
              return (
                <motion.div
                  key={u.key}
                  initial="hidden" whileInView="show" viewport={{ once: true }} custom={i} variants={fade}
                  data-testid={`use-case-${u.key}`}
                  className="group rounded-2xl border border-line bg-canvas p-7 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-medium"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-light text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                    <Icon className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <h3 className="mt-5 font-heading text-lg font-semibold text-ink">{u.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{u.blurb}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRIVACY HERO BAND */}
      <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-ink px-7 py-14 text-white shadow-lift md:px-16 md:py-20">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-grass/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-grass">
              <ShieldCheck className="h-4 w-4" /> Privacy by design
            </span>
            <h2 className="mt-5 font-heading text-3xl font-bold leading-tight tracking-tight text-balance md:text-4xl">
              Your data never touches a server. Because it never leaves your browser.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 md:text-base">
              PDF Batch does all of its work locally using your device. There's no
              upload step, no cloud storage, and nothing for us to see. Close the
              tab and it's gone.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {["No uploads", "No accounts to process", "No tracking of file contents"].map((t) => (
                <span key={t} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/90">
                  <Sparkles className="h-4 w-4 text-grass" /> {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-7xl px-5 pb-8 md:px-8">
        <div className="rounded-3xl border border-line bg-white px-7 py-14 text-center shadow-soft md:py-20">
          <h2 className="mx-auto max-w-2xl font-heading text-3xl font-bold tracking-tight text-ink text-balance md:text-4xl">
            Ready to stop filling PDFs one by one?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-ink-soft md:text-base">
            Your first 3 documents are free. No sign-up required to try the sample.
          </p>
          <Link
            to="/app"
            data-testid="footer-cta"
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-grass px-7 py-4 text-sm font-semibold text-white shadow-medium transition-[transform,background-color] duration-200 hover:bg-grass-hover hover:-translate-y-0.5 active:scale-95"
          >
            Start generating free
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </div>
  );
}
