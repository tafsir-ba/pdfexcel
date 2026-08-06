import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2, CheckCircle2, Download, FileArchive, RotateCcw,
  ChevronLeft, FileText, PartyPopper, Lock,
} from "lucide-react";
import { sampleRows } from "@/data/mockData";

const TOTAL = sampleRows.length;

export const StepDownload = ({ onBack, onRestart }) => {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const step = 100 / (TOTAL * 4);
    const t = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(100, p + step * (1 + Math.random()));
        if (next >= 100) {
          clearInterval(t);
          setTimeout(() => setDone(true), 350);
          return 100;
        }
        return next;
      });
    }, 90);
    return () => clearInterval(t);
  }, []);

  const generatedCount = Math.min(TOTAL, Math.round((progress / 100) * TOTAL));

  const handleDownload = () => {
    toast.success("ZIP download started", {
      description: `${TOTAL} PDFs · certificates_may_2026.zip (demo)`,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="mb-6">
        <h2 className="font-heading text-xl font-bold tracking-tight text-ink">
          {done ? "Your batch is ready" : "Generating your batch"}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {done ? "All documents were filled locally in your browser." : "Filling each PDF from your spreadsheet rows…"}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div
            key="progress"
            exit={{ opacity: 0, y: -8 }}
            data-testid="download-progress"
            className="rounded-2xl border border-line bg-white p-8 shadow-soft"
          >
            <div className="mx-auto max-w-md text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-light text-brand">
                <Loader2 className="h-8 w-8 animate-spin" />
              </span>
              <p className="mt-5 font-heading text-2xl font-bold text-ink">{Math.round(progress)}%</p>
              <p className="mt-1 text-sm text-ink-soft">
                Generating <span className="font-semibold text-ink">{generatedCount}</span> of {TOTAL} documents
              </p>

              <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-line">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand to-grass"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="mt-6 space-y-2 text-left">
                {sampleRows.slice(0, generatedCount).slice(-3).map((r) => (
                  <div key={r.certificate_id} className="flex items-center gap-2 rounded-lg bg-canvas px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-grass" />
                    <FileText className="h-4 w-4 text-ink-muted" />
                    <span className="truncate font-mono text-xs text-ink-soft">
                      {r.full_name.replace(/\s/g, "_")}_{r.certificate_id}.pdf
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-6 inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <Lock className="h-3.5 w-3.5 text-grass" /> Processing on your device — nothing uploaded
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            data-testid="download-success"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
              {/* ZIP card */}
              <div className="md:col-span-7">
                <div className="relative overflow-hidden rounded-2xl border border-grass/30 bg-white p-8 shadow-medium">
                  <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-grass/10 blur-2xl" />
                  <span className="inline-flex items-center gap-2 rounded-full bg-grass-light px-3 py-1.5 text-xs font-semibold text-grass-hover">
                    <PartyPopper className="h-4 w-4" /> Batch complete
                  </span>

                  <div className="mt-6 flex items-center gap-4">
                    <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-ink text-white shadow-medium">
                      <FileArchive className="h-8 w-8" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-semibold text-ink">certificates_may_2026.zip</p>
                      <p className="text-xs text-ink-soft">{TOTAL} PDF files · 1.8 MB (demo)</p>
                    </div>
                  </div>

                  <button
                    data-testid="download-zip-btn"
                    onClick={handleDownload}
                    className="group mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-grass px-6 py-4 text-sm font-semibold text-white shadow-medium transition-[transform,background-color] duration-200 hover:bg-grass-hover hover:-translate-y-0.5 active:scale-95"
                  >
                    <Download className="h-5 w-5 transition-transform duration-200 group-hover:translate-y-0.5" />
                    Download ZIP
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="md:col-span-5">
                <div className="h-full rounded-2xl border border-line bg-white p-6 shadow-soft">
                  <h3 className="font-heading text-base font-semibold text-ink">Batch summary</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    {[
                      ["Documents created", TOTAL],
                      ["Template", "certificate…pdf"],
                      ["Fields filled", 5],
                      ["Failed", 0],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between border-b border-line pb-2 last:border-0">
                        <dt className="text-ink-soft">{k}</dt>
                        <dd className="font-mono font-semibold text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-grass-light px-3 py-2 text-xs font-medium text-grass-hover">
                    <CheckCircle2 className="h-4 w-4" /> 100% processed locally
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                data-testid="download-back-btn"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
              >
                <ChevronLeft className="h-4 w-4" /> Back to mapping
              </button>
              <button
                data-testid="download-restart-btn"
                onClick={onRestart}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
              >
                <RotateCcw className="h-4 w-4" /> Start a new batch
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
