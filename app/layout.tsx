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
    title: "PDF Mail Merge from Excel or CSV",
    description: "Mail merge Excel or CSV data into fillable PDF forms. Generate individually named PDFs privately in your browser with no Acrobat, account, or uploads.",
    openGraph: {
      title: "PDF Mail Merge from Excel or CSV",
      description: "Turn spreadsheet rows into individually named PDFs. No Acrobat, account, or uploads.",
      type: "website",
      images: [{ url: "/og.png", width: 1717, height: 916, alt: "PDF Mail Merge turns Excel or CSV rows into individual PDFs" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "PDF Mail Merge from Excel or CSV",
      description: "Turn spreadsheet rows into individually named PDFs. No Acrobat or uploads.",
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
