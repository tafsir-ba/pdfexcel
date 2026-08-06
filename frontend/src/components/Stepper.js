import React from "react";
import { Check } from "lucide-react";

const steps = [
  { id: 1, label: "Add files" },
  { id: 2, label: "Map fields" },
  { id: 3, label: "Download" },
];

export const Stepper = ({ current = 1, onStepClick }) => {
  return (
    <div data-testid="wizard-stepper" className="w-full">
      <div className="flex items-center">
        {steps.map((s, i) => {
          const done = s.id < current;
          const active = s.id === current;
          const clickable = s.id <= current && onStepClick;
          return (
            <React.Fragment key={s.id}>
              <button
                type="button"
                data-testid={`stepper-step-${s.id}`}
                disabled={!clickable}
                onClick={() => clickable && onStepClick(s.id)}
                className={`flex items-center gap-3 ${clickable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold transition-[background-color,color,box-shadow] duration-300 ${
                    done
                      ? "bg-grass text-white shadow-medium"
                      : active
                      ? "bg-brand text-white shadow-medium ring-4 ring-brand-light"
                      : "bg-white text-ink-muted border border-line"
                  }`}
                >
                  {done ? <Check className="h-5 w-5" strokeWidth={3} /> : s.id}
                </span>
                <span className="hidden sm:block text-left">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                    Step {s.id}
                  </span>
                  <span
                    className={`block text-sm font-semibold ${
                      active || done ? "text-ink" : "text-ink-muted"
                    }`}
                  >
                    {s.label}
                  </span>
                </span>
              </button>
              {i < steps.length - 1 && (
                <div className="mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-grass transition-[width] duration-500 ease-out"
                    style={{ width: s.id < current ? "100%" : "0%" }}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
