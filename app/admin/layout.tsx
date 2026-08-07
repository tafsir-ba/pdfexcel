import type { ReactNode } from "react";
import type { Metadata } from "next";
import { AdminShell } from "./AdminShell";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin",
  description: "PDF Batch operator console. Admin views never show file contents.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
  alternates: {
    canonical: null,
  },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
