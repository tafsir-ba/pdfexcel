import React from "react";
import { Award, ShieldCheck } from "lucide-react";

// A stylized, static representation of a "filled" certificate PDF.
// `values` is a map of field.id -> resolved string value.
export const CertificatePreview = ({ values = {}, highlight = null, compact = false }) => {
  const v = (id, fallback) => values[id] || fallback;

  const FieldLine = ({ id, children, className = "" }) => (
    <span
      data-testid={`cert-field-${id}`}
      className={`transition-[background-color,color] duration-300 ${
        highlight === id ? "bg-brand-light rounded-md px-1.5 -mx-1.5 ring-1 ring-brand/30" : ""
      } ${className}`}
    >
      {children}
    </span>
  );

  return (
    <div
      data-testid="certificate-preview"
      className="relative aspect-[1.414/1] w-full overflow-hidden rounded-xl border border-line bg-white shadow-soft"
    >
      {/* Ornamental frame */}
      <div className="absolute inset-3 rounded-lg border-2 border-brand/15" />
      <div className="absolute inset-4 rounded-md border border-brand/10" />

      {/* Corner flourishes */}
      <span className="absolute left-5 top-5 h-6 w-6 rounded-tl-md border-l-2 border-t-2 border-brand/40" />
      <span className="absolute right-5 top-5 h-6 w-6 rounded-tr-md border-r-2 border-t-2 border-brand/40" />
      <span className="absolute bottom-5 left-5 h-6 w-6 rounded-bl-md border-b-2 border-l-2 border-brand/40" />
      <span className="absolute bottom-5 right-5 h-6 w-6 rounded-br-md border-b-2 border-r-2 border-brand/40" />

      <div className={`relative flex h-full flex-col items-center justify-center text-center ${compact ? "px-6" : "px-8 md:px-12"}`}>
        <span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-white">
          <Award className="h-6 w-6" strokeWidth={2} />
        </span>

        <p className={`mt-3 font-mono uppercase tracking-[0.28em] text-ink-muted ${compact ? "text-[9px]" : "text-[10px] md:text-xs"}`}>
          Certificate of Completion
        </p>

        <p className={`mt-4 text-ink-soft ${compact ? "text-[10px]" : "text-xs md:text-sm"}`}>
          This certifies that
        </p>

        <FieldLine
          id="field_name"
          className={`mt-1 font-heading font-bold tracking-tight text-ink ${compact ? "text-xl" : "text-2xl md:text-4xl"}`}
        >
          {v("field_name", "—")}
        </FieldLine>

        <p className={`mt-3 max-w-md text-ink-soft ${compact ? "text-[10px]" : "text-xs md:text-sm"}`}>
          has successfully completed the course{" "}
          <FieldLine id="field_course" className="font-semibold text-ink">
            {v("field_course", "—")}
          </FieldLine>
        </p>

        <div className={`mt-6 flex w-full items-end justify-between ${compact ? "px-2" : "px-2 md:px-6"}`}>
          <div className="text-left">
            <FieldLine id="field_date" className="block font-heading text-sm font-semibold text-ink">
              {v("field_date", "—")}
            </FieldLine>
            <span className="text-[10px] uppercase tracking-wider text-ink-muted">Date</span>
          </div>

          <ShieldCheck className="h-7 w-7 text-grass" strokeWidth={1.8} />

          <div className="text-right">
            <FieldLine id="field_signer" className="block font-heading text-sm font-semibold text-ink">
              {v("field_signer", "—")}
            </FieldLine>
            <span className="text-[10px] uppercase tracking-wider text-ink-muted">Instructor</span>
          </div>
        </div>

        <FieldLine
          id="field_cert"
          className={`mt-4 font-mono text-ink-muted ${compact ? "text-[9px]" : "text-[10px] md:text-xs"}`}
        >
          No. {v("field_cert", "—")}
        </FieldLine>
      </div>
    </div>
  );
};
