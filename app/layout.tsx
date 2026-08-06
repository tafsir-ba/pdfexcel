import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "PDF Batch — Fill PDF forms from Excel or CSV",
    description:
      "Batch-fill PDF forms from Excel or CSV. Free preview stays in your browser; paid access syncs templates and generated ZIPs to your account for re-download during the paid period.",
    openGraph: {
      title: "PDF Batch — Fill PDF forms from Excel or CSV",
      description:
        "One PDF form + one spreadsheet → one filled PDF per row. Paid accounts restore files and ZIPs across devices.",
      type: "website",
      images: [{ url: "/og.png", width: 1717, height: 916, alt: "PDF Batch turns Excel or CSV rows into individual filled PDFs" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF Batch — Fill PDF forms from Excel or CSV",
      description:
        "One PDF form + one spreadsheet → one filled PDF per row. Restore paid files and batches on any device.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-grain">{children}</body>
    </html>
  );
}
