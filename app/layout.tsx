import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "../lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(host.includes("pdfbatch.app") ? SITE_URL : `${protocol}://${host}`);

  return {
    metadataBase,
    title: {
      default: `Batch Fill PDF Forms from Excel or CSV | ${SITE_NAME}`,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
      "batch fill PDF",
      "PDF mail merge",
      "fill PDF from Excel",
      "fill PDF from CSV",
      "bulk PDF forms",
      "generate certificates from Excel",
    ],
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
    openGraph: {
      title: `Batch Fill PDF Forms from Excel or CSV | ${SITE_NAME}`,
      description: SITE_TAGLINE + ". Preview three PDFs free.",
      type: "website",
      url: SITE_URL,
      siteName: SITE_NAME,
      images: [
        {
          url: "/og.png",
          width: 1717,
          height: 916,
          alt: "PDF Batch turns Excel or CSV rows into individual filled PDFs",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `Batch Fill PDF Forms from Excel or CSV | ${SITE_NAME}`,
      description: SITE_TAGLINE + ". Preview three PDFs free.",
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
