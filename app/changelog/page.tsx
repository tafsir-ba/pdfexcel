import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "../components/MarketingPage";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Recent product updates for PDF Batch: placement tools, orientation fixes, and account sync.",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  return (
    <MarketingPage
      eyebrow="Changelog"
      title="What changed recently"
      lead="Shipped improvements that affect real batch jobs — landscape PDFs, manual placement, and paid workspace sync."
    >
      <h2>2026-08-06</h2>
      <ul>
        <li>Fixed landscape PDFs that use /Rotate so placed text stays upright when generating.</li>
        <li>Restored use-case icons on the marketing homepage.</li>
        <li>Moved field editing into a top toolbar with quieter overlays and click-to-place Add field.</li>
        <li>Preserved manually added fields after reload when auto-detection finds nothing.</li>
        <li>Allowed any PDF to load for manual placement when no writing areas are detected.</li>
        <li>Improved diploma-style detection when captions sit under writing lines.</li>
      </ul>

      <h2>Earlier</h2>
      <ul>
        <li>Paid account workspace sync and ZIP re-download under My files.</li>
        <li>Live pricing display from the admin plan.</li>
        <li>Placement font fallback when a typeface cannot encode characters.</li>
      </ul>

      <p>
        Try the latest build on the <Link href="/#tool">homepage tool</Link>.
      </p>
    </MarketingPage>
  );
}
