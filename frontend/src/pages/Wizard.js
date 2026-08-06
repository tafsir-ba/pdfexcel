import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Stepper } from "@/components/Stepper";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { StepUpload } from "@/components/wizard/StepUpload";
import { StepMap } from "@/components/wizard/StepMap";
import { StepDownload } from "@/components/wizard/StepDownload";
import { pdfFields, pdfFileName, csvFileName } from "@/data/mockData";
import { ChevronLeft } from "lucide-react";

const defaultMapping = () => {
  const m = {};
  pdfFields.forEach((f) => (m[f.id] = f.suggested));
  return m;
};

export default function Wizard() {
  const [step, setStep] = useState(1);
  const [pdf, setPdf] = useState(null);
  const [csv, setCsv] = useState(null);
  const [mapping, setMapping] = useState(defaultMapping);

  const loadSample = useCallback(() => {
    setPdf({ name: pdfFileName, fields: pdfFields.length });
    setCsv({ name: csvFileName, rows: 6 });
    setMapping(defaultMapping());
  }, []);

  const goto = (s) => setStep(s);

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 md:px-8 md:py-14">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/"
            data-testid="wizard-back-home"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" /> Back to home
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-ink md:text-3xl">
            Batch fill your PDFs
          </h1>
        </div>
        <PrivacyBadge testId="wizard-privacy-badge" />
      </div>

      {/* Stepper */}
      <div className="mt-8 rounded-2xl border border-line bg-white p-5 shadow-soft md:p-6">
        <Stepper current={step} onStepClick={goto} />
      </div>

      {/* Step body */}
      <div className="mt-8">
        {step === 1 && (
          <StepUpload
            pdf={pdf}
            csv={csv}
            setPdf={setPdf}
            setCsv={setCsv}
            onSample={loadSample}
            onNext={() => goto(2)}
          />
        )}
        {step === 2 && (
          <StepMap
            mapping={mapping}
            setMapping={setMapping}
            onBack={() => goto(1)}
            onNext={() => goto(3)}
          />
        )}
        {step === 3 && (
          <StepDownload
            mapping={mapping}
            onBack={() => goto(2)}
            onRestart={() => {
              setPdf(null);
              setCsv(null);
              setMapping(defaultMapping());
              goto(1);
            }}
          />
        )}
      </div>
    </div>
  );
}
