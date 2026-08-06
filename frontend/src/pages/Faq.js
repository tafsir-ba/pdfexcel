import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { MessageCircleQuestion, ArrowRight } from "lucide-react";
import { faqs } from "@/data/mockData";

export default function Faq() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-24">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-light text-brand">
          <MessageCircleQuestion className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-heading text-4xl font-bold tracking-tight text-ink text-balance sm:text-5xl">
          Frequently asked questions
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-base text-ink-soft">
          Everything you need to know about batch-filling PDFs privately.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mt-12"
      >
        <Accordion type="single" collapsible defaultValue="item-0" className="space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              data-testid={`faq-item-${i}`}
              className="overflow-hidden rounded-2xl border border-line bg-white px-5 shadow-soft data-[state=open]:shadow-medium"
            >
              <AccordionTrigger className="py-5 text-left font-heading text-base font-semibold text-ink hover:no-underline [&>svg]:text-brand">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-ink-soft">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </motion.div>

      <div className="mt-14 rounded-3xl border border-line bg-white p-8 text-center shadow-soft">
        <h2 className="font-heading text-xl font-bold text-ink">Still have a question?</h2>
        <p className="mt-2 text-sm text-ink-soft">Try the sample batch — it answers most things in about 20 seconds.</p>
        <Link
          to="/app"
          data-testid="faq-cta"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-medium transition-[transform,background-color] duration-200 hover:bg-brand-hover hover:-translate-y-0.5 active:scale-95"
        >
          Try the sample <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
