import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { themeInitScript } from "@/components/layout/ThemeToggle";
import { TopAnnouncement } from "@/components/layout/Announcements";
import { WhatsAppFab } from "@/components/layout/WhatsAppCta";
import { getContact } from "@/lib/cms/store";
import { JsonLd } from "@/components/seo/JsonLd";
import { RevealObserver } from "@/components/ui/RevealObserver";
import { ToastProvider } from "@/components/ui/Toast";
import { dirOf, ENABLED_LOCALES } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/json-ld";
import { getSiteUrl } from "@/lib/seo/site";
import { AnalyticsRoot } from "@/components/analytics/AnalyticsRoot";
import { analyticsConfig, siteVerificationToken } from "@/lib/analytics/config";
import "../globals.css";

// Latin + latin-ext only (Turkish/EN/FR); Cyrillic faces load on demand via unicode-range (RU).
// Inter IS preloaded since Sprint 8: the home/category LCP element is now the hero TEXT (measured 86→89 / 85→88 mobile).
// Arabic stays un-preloaded; the size-adjusted fallback keeps CLS at 0. Trade-off measured: Next preloads
// module-level fonts on EVERY locale, so /ar pays for Inter too (88→83); a per-locale preload would need per-locale layouts.
const inter = Inter({ variable: "--font-body", subsets: ["latin", "latin-ext"], display: "swap", preload: true });
// Sprint 12 redesign: headings use Inter too (tight tracking) — one Latin family, no extra heading font request.
const arabic = IBM_Plex_Sans_Arabic({ variable: "--font-arabic-face", subsets: ["arabic"], weight: ["400", "700"], display: "swap", preload: false });

export function generateStaticParams() {
  return ENABLED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { d } = getI18n((await params).locale);
  return {
    metadataBase: new URL(getSiteUrl()),
    title: { default: `${d.meta.siteName} — ${d.meta.tagline}`, template: `%s | ${d.meta.siteName}` },
    description: d.meta.defaultDescription,
    applicationName: d.meta.siteName,
    // small derivatives of the original logo (the 500×500 original stays untouched in /brand/kornne-logo.png)
    icons: { icon: [{ url: "/brand/kornne-icon-64.png", sizes: "64x64", type: "image/png" }], apple: [{ url: "/brand/kornne-icon-180.png", sizes: "180x180" }] },
    formatDetection: { telephone: false },
    // Search Console HTML-tag verification — only when the client's token is configured (never invented)
    ...(siteVerificationToken() ? { verification: { google: siteVerificationToken()! } } : {}),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f141a" },
  ],
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale, d, t } = getI18n((await params).locale);
  const contact = await getContact();
  const fontVars = [inter.variable, locale === "ar" ? arabic.variable : ""].join(" ");
  // analytics + consent banner exist only when explicitly enabled by env (default: nothing is rendered or loaded)
  const analytics = analyticsConfig();

  return (
    <html lang={locale} dir={dirOf(locale)} className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a href="#main" className="sr-only z-50 rounded-[var(--radius-md)] bg-brand-700 px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
          {d.a11y.skipToContent}
        </a>
        <ToastProvider closeLabel={d.a11y.close}>
          {analytics.enabled ? <AnalyticsRoot mode={analytics.mode!} id={analytics.id!} labels={d.consent} policyHref="/sayfa/kisisel-verilenin-korunmasi-kanunu" legalApproved={analytics.legalApproved} /> : null}
          <TopAnnouncement locale={locale} label={d.cms.announcement} />
          <SiteHeader localeParam={locale} />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <SiteFooter localeParam={locale} />
          <WhatsAppFab label={d.product.whatsappOrder} message={t(d.product.whatsappMessage, { url: getSiteUrl() })} number={contact.whatsapp} />
        </ToastProvider>
        <RevealObserver />
        <JsonLd data={organizationJsonLd(contact)} />
        <JsonLd data={websiteJsonLd(locale)} />
      </body>
    </html>
  );
}
