import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Lock, Menu, X, FileStack } from "lucide-react";

const links = [
  { to: "/", label: "Home" },
  { to: "/app", label: "Try it" },
  { to: "/pricing", label: "Pricing" },
  { to: "/faq", label: "FAQ" },
];

export const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-testid="top-nav"
      className={`sticky top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300 ${
        scrolled
          ? "bg-white/80 backdrop-blur-xl border-b border-line shadow-soft"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <nav className="mx-auto max-w-7xl px-5 md:px-8 h-16 flex items-center justify-between">
        <Link to="/" data-testid="nav-logo" className="flex items-center gap-2.5 group">
          <span className="grid place-items-center h-9 w-9 rounded-xl bg-ink text-white shadow-medium transition-transform duration-200 group-hover:-translate-y-0.5">
            <FileStack className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <span className="font-heading font-bold text-lg tracking-tight text-ink">
            PDF Batch
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                data-testid={`nav-link-${l.label.toLowerCase().replace(/\s/g, "-")}`}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "text-ink bg-white shadow-soft"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft">
            <Lock className="h-3.5 w-3.5 text-grass" strokeWidth={2.5} />
            100% local
          </span>
          <Link
            to="/app"
            data-testid="nav-cta"
            className="inline-flex items-center rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-medium transition-[transform,background-color] duration-200 hover:bg-brand-hover hover:-translate-y-0.5 active:scale-95"
          >
            Start free
          </Link>
        </div>

        <button
          data-testid="nav-mobile-toggle"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden grid place-items-center h-10 w-10 rounded-xl border border-line bg-white text-ink"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div data-testid="nav-mobile-menu" className="md:hidden border-t border-line bg-white px-5 py-4 space-y-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="block px-4 py-3 rounded-xl text-sm font-medium text-ink-soft hover:bg-canvas hover:text-ink transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/app"
            className="block text-center rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white mt-2"
          >
            Start free
          </Link>
        </div>
      )}
    </header>
  );
};
