import type { Metadata } from "next";
import Link from "next/link";
import { Inter } from "next/font/google";
import "./globals.css";

/** Unmatched routes outside any locale/admin layout (rare: the proxy rewrites almost everything into a locale). */
// preload off: this root-level font instance would otherwise add Inter preloads to every storefront page
const inter = Inter({ variable: "--font-body", subsets: ["latin", "latin-ext"], display: "swap", preload: false });

export const metadata: Metadata = { title: "404 — KORNNE", robots: { index: false, follow: false } };

export default function GlobalNotFound() {
  return (
    <html lang="tr" className={inter.variable}>
      <body className="flex min-h-dvh items-center justify-center p-6 text-center">
        <main className="space-y-4">
          <p className="text-6xl font-bold text-brand-700">404</p>
          <h1 className="text-2xl font-bold">Sayfa bulunamadı</h1>
          <Link href="/" className="inline-flex min-h-12 items-center rounded-[10px] bg-brand-700 px-5 font-semibold text-white">
            Anasayfa
          </Link>
        </main>
      </body>
    </html>
  );
}
