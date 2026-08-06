import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CertificatePreview } from "@/components/CertificatePreview";
import { csvColumns, sampleRows, pdfFields } from "@/data/mockData";
import { ArrowRight, ChevronLeft, ChevronRight, Link2, Eye } from "lucide-react";

const NONE = "__none__";

export const StepMap = ({ mapping, setMapping, onBack, onNext }) => {
  const [rowIndex, setRowIndex] = useState(0);
  const [hover, setHover] = useState(null);
  const row = sampleRows[rowIndex];

  const values = {};
  pdfFields.forEach((f) => {
    const col = mapping[f.id];
    values[f.id] = col && col !== NONE ? row[col] : "";
  });

  const mappedCount = pdfFields.filter((f) => mapping[f.id] && mapping[f.id] !== NONE).length;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="mb-6">
        <h2 className="font-heading text-xl font-bold tracking-tight text-ink">Map your fields</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Connect each PDF field to a spreadsheet column. Preview updates live.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT — mapping controls */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">
                PDF field → CSV column
              </span>
              <span className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand">
                {mappedCount}/{pdfFields.length} mapped
              </span>
            </div>

            <div className="space-y-3">
              {pdfFields.map((f) => {
                const active = hover === f.id;
                return (
                  <div
                    key={f.id}
                    data-testid={`mapping-row-${f.id}`}
                    onMouseEnter={() => setHover(f.id)}
                    onMouseLeave={() => setHover(null)}
                    className={`rounded-xl border p-3 transition-[border-color,background-color] duration-200 ${
                      active ? "border-brand/40 bg-brand-light/40" : "border-line bg-canvas"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{f.label}</span>
                        <span className="text-[11px] text-ink-muted">PDF field</span>
                      </div>

                      <Link2 className={`h-4 w-4 shrink-0 transition-colors duration-200 ${active ? "text-brand" : "text-ink-muted"}`} />

                      <div className="min-w-0 flex-1">
                        <Select
                          value={mapping[f.id] || NONE}
                          onValueChange={(val) => setMapping((m) => ({ ...m, [f.id]: val }))}
                        >
                          <SelectTrigger
                            data-testid={`mapping-select-${f.id}`}
                            className="h-10 rounded-xl border-line bg-white font-mono text-xs focus:ring-brand"
                          >
                            <SelectValue placeholder="Select column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE} className="font-mono text-xs text-ink-muted">
                              — Don't fill —
                            </SelectItem>
                            {csvColumns.map((c) => (
                              <SelectItem key={c} value={c} className="font-mono text-xs">
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — live preview */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-ink-muted">
                <Eye className="h-4 w-4" /> Live preview
              </span>

              {/* Scrubber */}
              <div className="flex items-center gap-2">
                <button
                  data-testid="preview-prev"
                  onClick={() => setRowIndex((i) => Math.max(0, i - 1))}
                  disabled={rowIndex === 0}
                  className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink-soft transition-colors enabled:hover:border-ink enabled:hover:text-ink disabled:opacity-30"
                  aria-label="Previous row"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span data-testid="preview-row-indicator" className="min-w-[84px] text-center font-mono text-xs font-medium text-ink">
                  Row {rowIndex + 1} of {sampleRows.length}
                </span>
                <button
                  data-testid="preview-next"
                  onClick={() => setRowIndex((i) => Math.min(sampleRows.length - 1, i + 1))}
                  disabled={rowIndex === sampleRows.length - 1}
                  className="grid h-8 w-8 place-items-center rounded-full border border-line text-ink-soft transition-colors enabled:hover:border-ink enabled:hover:text-ink disabled:opacity-30"
                  aria-label="Next row"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <CertificatePreview values={values} highlight={hover} />

            {/* scrubber track */}
            <div className="mt-4 flex items-center gap-1.5">
              {sampleRows.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setRowIndex(i)}
                  data-testid={`preview-dot-${i}`}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                    i === rowIndex ? "bg-brand" : "bg-line hover:bg-ink-muted"
                  }`}
                  aria-label={`Go to row ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* nav */}
      <div className="mt-8 flex items-center justify-between">
        <button
          data-testid="map-back-btn"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink/30"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          data-testid="map-next-btn"
          disabled={mappedCount === 0}
          onClick={onNext}
          className="group inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-medium transition-[transform,background-color,opacity] duration-200 enabled:hover:bg-brand-hover enabled:hover:-translate-y-0.5 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Generate batch
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-enabled:group-hover:translate-x-1" />
        </button>
      </div>
    </motion.div>
  );
};
