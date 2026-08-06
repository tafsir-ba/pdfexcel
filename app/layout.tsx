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
    description: "Batch-fill PDF forms from Excel or CSV. Upload one form and one spreadsheet, then download one completed PDF per row — privately in your browser, with no uploads.",
    openGraph: {
      title: "PDF Batch — Fill PDF forms from Excel or CSV",
      description: "One PDF form + one spreadsheet → one filled PDF per row. No Acrobat, and files stay in your browser.",
      type: "website",
      images: [{ url: "/og.png", width: 1717, height: 916, alt: "PDF Batch turns Excel or CSV rows into individual filled PDFs" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF Batch — Fill PDF forms from Excel or CSV",
      description: "One PDF form + one spreadsheet → one filled PDF per row. No Acrobat or file uploads.",
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
