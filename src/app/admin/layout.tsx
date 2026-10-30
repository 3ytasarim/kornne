import type { Metadata } from "next";
import { Inter, Roboto_Slab } from "next/font/google";
import { themeInitScript } from "@/components/layout/ThemeToggle";
import { getSiteUrl } from "@/lib/seo/site";
import "../globals.css";

const inter = Inter({ variable: "--font-body", subsets: ["latin", "latin-ext"], display: "swap" });
const slab = Roboto_Slab({ variable: "--font-heading", subsets: ["latin", "latin-ext"], weight: ["600", "700"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "KORNNE Yönetim", template: "%s · KORNNE Yönetim" },
  robots: { index: false, follow: false, nocache: true },
  icons: { icon: "/brand/kornne-icon-64.png" },
};

/** Separate root layout for the admin (Turkish UI, no storefront chrome, never indexed). */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" dir="ltr" className={`${inter.variable} ${slab.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-surface-2">{children}</body>
    </html>
  );
}
