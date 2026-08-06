import React from "react";
import { Link } from "react-router-dom";
import { FileStack, Lock, Github, Twitter } from "lucide-react";

const cols = [
  {
    title: "Product",
    items: [
      { label: "How it works", to: "/app" },
      { label: "Pricing", to: "/pricing" },
      { label: "FAQ", to: "/faq" },
    ],
  },
  {
    title: "Use cases",
    items: [
      { label: "Certificates", to: "/app" },
      { label: "Letters", to: "/app" },
      { label: "Forms", to: "/app" },
    ],
  },
  {
    title: "Company",
    items: [
      { label: "Privacy", to: "/" },
      { label: "Terms", to: "/" },
      { label: "Contact", to: "/" },
    ],
  },
];

export const Footer = () => {
  return (
    <footer data-testid="footer" className="mt-24 border-t border-line bg-white">
      <div className="mx-auto max-w-7xl px-5 md:px-8 py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid place-items-center h-9 w-9 rounded-xl bg-ink text-white">
                <FileStack className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <span className="font-heading font-bold text-lg tracking-tight text-ink">
                PDF Batch
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
              Fill hundreds of PDF forms from a spreadsheet — entirely in your
              browser. No uploads, no Acrobat, no fuss.
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-grass-light px-3 py-1.5 text-xs font-semibold text-grass-hover">
              <Lock className="h-3.5 w-3.5" strokeWidth={2.5} />
              No server uploads
            </span>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="font-heading text-sm font-semibold text-ink">{c.title}</h4>
              <ul className="mt-4 space-y-3">
                {c.items.map((it) => (
                  <li key={it.label}>
                    <Link
                      to={it.to}
                      className="text-sm text-ink-soft transition-colors hover:text-brand"
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 md:flex-row md:items-center">
          <p className="text-xs text-ink-muted">
            © {new Date().getFullYear()} PDF Batch. A privacy-first demo experience.
          </p>
          <div className="flex items-center gap-3">
            <a href="/" aria-label="GitHub" className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:text-ink hover:border-ink">
              <Github className="h-4 w-4" />
            </a>
            <a href="/" aria-label="Twitter" className="grid h-9 w-9 place-items-center rounded-full border border-line text-ink-soft transition-colors hover:text-ink hover:border-ink">
              <Twitter className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
