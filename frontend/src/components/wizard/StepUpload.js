import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  UploadCloud, FileText, Table2, X, Loader2, CheckCircle2,
  AlertTriangle, ArrowRight, Sparkles,
} from "lucide-react";
import { pdfFields } from "@/data/mockData";

const CONFIG = {
  pdf: {
    testId: "upload-zone-pdf",
    icon: FileText,
    title: "Drop your PDF form",
    hint: "Fillable .pdf template",
    accept: ".pdf",
    ext: "pdf",
  },
  csv: {
    testId: "upload-zone-csv",
    icon: Table2,
    title: "Drop your spreadsheet",
    hint: ".csv or .xlsx with one row per document",
    accept: ".csv,.xlsx",
    ext: ["csv", "xlsx"],
  },
};

const UploadZone = ({ type, file, setFile }) => {
  const cfg = CONFIG[type];
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const Icon = cfg.icon;

  const validExt = Array.isArray(cfg.ext) ? cfg.ext : [cfg.ext];

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!validExt.includes(ext)) {
      setError(`That's a .${ext} file — please choose a ${validExt.map((e) => "." + e).join(" or ")} file.`);
      return;
    }
    setError("");
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setFile({
        name: f.name,
        rows: type === "csv" ? 6 : undefined,
        fields: type === "pdf" ? pdfFields.length : undefined,
      });
    }, 900);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  // SUCCESS
  if (file) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        data-testid={`${cfg.testId}-success`}
        className="flex items-center gap-4 rounded-2xl border border-grass/30 bg-grass-light p-5"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-grass shadow-soft">
          <Icon className="h-6 w-6" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-grass" />
            <span className="truncate font-mono text-sm font-medium text-ink">{file.name}</span>
          </div>
          <span className="text-xs text-ink-soft">
            {type === "pdf" ? `${file.fields} fillable fields detected` : `${file.rows} rows ready to fill`}
          </span>
        </div>
        <button
          data-testid={`${cfg.testId}-remove`}
          onClick={() => setFile(null)}
          className="grid h-9 w-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-white hover:text-ink"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>
    );
  }

  // ZONE (empty / hover / loading / error)
  return (
    <div>
      <button
        type="button"
        data-testid={cfg.testId}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`group relative flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-[border-color,background-color,transform] duration-200 ${
          error
            ? "border-destructive/40 bg-destructive/5"
            : drag
            ? "border-brand bg-brand-light scale-[1.01]"
            : "border-brand/25 bg-white hover:border-brand/50 hover:bg-brand-light/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={cfg.accept}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
          data-testid={`${cfg.testId}-input`}
        />
        {loading ? (
          <>
            <Loader2 className="h-9 w-9 animate-spin text-brand" />
            <p className="mt-3 text-sm font-semibold text-ink">Reading file…</p>
            <p className="text-xs text-ink-soft">Processing locally in your browser</p>
          </>
        ) : (
          <>
            <span className={`grid h-14 w-14 place-items-center rounded-2xl transition-colors duration-200 ${drag ? "bg-brand text-white" : "bg-brand-light text-brand"}`}>
              <UploadCloud className="h-7 w-7" strokeWidth={2} />
            </span>
            <p className="mt-4 font-heading text-base font-semibold text-ink">{cfg.title}</p>
            <p className="mt-1 text-xs text-ink-soft">
              {drag ? "Release to add" : <>Drag & drop or <span className="font-semibold text-brand">browse</span></>}
            </p>
            <p className="mt-3 font-mono text-[11px] text-ink-muted">{cfg.hint}</p>
          </>
        )}
      </button>

      {error && (
        <div data-testid={`${cfg.testId}-error`} className="mt-2 flex items-start gap-2 rounded-xl bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export const StepUpload = ({ pdf, csv, setPdf, setCsv, onSample, onNext }) => {
  const ready = pdf && csv;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-bold tracking-tight text-ink">Add your files</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Add a PDF template and a spreadsheet. Both stay on your device.
          </p>
        </div>
        <button
          data-testid="try-sample-btn"
          onClick={onSample}
          className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-light px-4 py-2 text-sm font-semibold text-brand transition-[transform,background-color] duration-200 hover:bg-brand hover:text-white active:scale-95"
        >
          <Sparkles className="h-4 w-4" /> Try the sample
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <UploadZone type="pdf" file={pdf} setFile={setPdf} />
        <UploadZone type="csv" file={csv} setFile={setCsv} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          {ready ? "Both files ready." : "Add both files to continue."}
        </p>
        <button
          data-testid="upload-next-btn"
          disabled={!ready}
          onClick={onNext}
          className="group inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-medium transition-[transform,background-color,opacity] duration-200 enabled:hover:bg-brand-hover enabled:hover:-translate-y-0.5 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue to mapping
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-enabled:group-hover:translate-x-1" />
        </button>
      </div>
    </motion.div>
  );
};
