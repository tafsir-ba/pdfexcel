import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Table2, FileCheck2 } from "lucide-react";
import { CertificatePreview } from "@/components/CertificatePreview";
import { sampleRows, pdfFields } from "@/data/mockData";

const cols = [
  { key: "full_name", label: "full_name" },
  { key: "course_name", label: "course_name" },
  { key: "certificate_id", label: "certificate_id" },
];

const rowToValues = (row) => {
  const out = {};
  pdfFields.forEach((f) => {
    out[f.id] = row[f.suggested];
  });
  return out;
};

export const HeroDemo = () => {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % sampleRows.length), 2800);
    return () => clearInterval(t);
  }, []);

  const row = sampleRows[idx];

  return (
    <div
      data-testid="hero-demo"
      className="relative rounded-2xl border border-line bg-white/70 p-4 shadow-lift backdrop-blur-xl md:p-6"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1.15fr] md:items-center md:gap-3">
        {/* Spreadsheet */}
        <div className="rounded-xl border border-line bg-white shadow-soft">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Table2 className="h-4 w-4 text-grass" />
            <span className="font-mono text-[11px] text-ink-soft">graduates.csv</span>
          </div>
          <div className="overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      className="px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-wide text-ink-muted"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 4).map((r, i) => (
                  <tr
                    key={r.certificate_id}
                    className={`border-b border-line/60 transition-colors duration-300 ${
                      i === idx % 4 ? "bg-brand-light" : ""
                    }`}
                  >
                    {cols.map((c) => (
                      <td
                        key={c.key}
                        className={`truncate px-3 py-2 font-mono text-[10px] ${
                          i === idx % 4 ? "font-semibold text-brand" : "text-ink-soft"
                        }`}
                      >
                        {r[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center">
          <motion.span
            animate={{ x: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white shadow-medium md:rotate-0"
          >
            <ArrowRight className="h-5 w-5" />
          </motion.span>
        </div>

        {/* Certificate */}
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={row.certificate_id}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <CertificatePreview values={rowToValues(row)} compact />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-soft">
        <FileCheck2 className="h-4 w-4 text-grass" />
        Generating <span className="font-semibold text-ink">{sampleRows.length}</span> certificates from 1 template
      </div>
    </div>
  );
};
