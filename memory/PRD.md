# PDF Batch — UI/UX Redesign PRD

## Original Problem Statement
Full visual + interaction redesign of **PDF Batch**, a privacy-first tool that batch-fills PDF forms from Excel/CSV. Built as a **static front-end** (React) with mocked data and non-functional backend, so CSS/components can be lifted into the existing codebase.

## User Choices
- Palette: proposed off-white (#FAFAF7) / navy (#0F172A) / indigo (#4F46E5) / emerald (#10B981), as-is
- Light theme only
- 3-step wizard fully simulated with sample data
- Include "Try the sample" flow

## Architecture (Frontend-only, no backend)
- React 19 + CRA/craco, Tailwind CSS with design tokens, framer-motion, lucide-react, shadcn/ui (Select, Accordion), sonner toasts.
- Routes: `/` Landing, `/app` Wizard, `/pricing` Pricing, `/faq` FAQ.
- All data mocked in `src/data/mockData.js`; no API calls, no MongoDB.

## User Personas
- Office/admin staff generating certificates, letters, forms in bulk
- Small businesses & educators without Acrobat
- Privacy-conscious users who don't want file uploads

## Core Requirements (static)
Design system tokens (colors/type/spacing/radius/shadows), global nav + footer, landing with hero mini-demo + trust stats + use cases + privacy band, 3-step wizard (Add files → Map fields → Download) with all UI states, pricing tiers, FAQ accordion, full responsive.

## Implemented (2026-06-06)
- Design system: tokens in `tailwind.config.js` + `index.css` (Outfit headings, Inter body, IBM Plex Mono data). Custom scrollbar, paper grain.
- Global: `Navbar` (sticky, scroll-aware, mobile menu), `Footer`, `PrivacyBadge`, `Stepper`.
- Landing: animated `HeroDemo` (spreadsheet row → filled certificate), trust stats, how-it-works, use cases, privacy band, CTA.
- Wizard: `StepUpload` (drag/hover/loading/success/error + Try the sample), `StepMap` (mapping selects + live `CertificatePreview` + Row X of N scrubber + connectors), `StepDownload` (simulated progress → success ZIP card + summary + toast + restart).
- Pricing: 3 tier cards (Free/Pro/Business), Pro highlighted.
- FAQ: shadcn accordion.
- Verified: testing agent 23/23 frontend checks passed (100%). Step-3 progress StrictMode bug fixed.

## Backlog / Remaining (P1/P2)
- P2: aria-live on progress region for a11y
- P2: dark mode (deferred — light only per user)
- P2: more template types (letter/form) previews beyond certificate

## Next Tasks
- Await user feedback on visual direction; extend to additional document templates if requested.
