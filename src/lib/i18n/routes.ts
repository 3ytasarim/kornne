import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/**
 * Localized first URL segment. Internal (file-system) route names are Turkish and equal to the legacy
 * kornne.com paths (urun, kategori, sayfa, iletisim, ...). Only the first segment is translated; entity
 * slugs come from the translation tables. Adapted from Mezbaha-Teknolojileri src/lib/i18n/routes.ts.
 */
export const SEGMENTS: Record<Locale, Record<string, string>> = {
  tr: {},
  en: { urun: "product", kategori: "category", sayfa: "page", iletisim: "contact", arama: "search", "teklif-listem": "quote-list", sepetim: "cart", odeme: "checkout", blog: "blog", sss: "faq", "siparisim-ne-durumda": "order-status", "odeme-bildirimi": "payment-notice", "banka-hesaplari": "bank-accounts" },
  fr: { urun: "produit", kategori: "categorie", sayfa: "page", iletisim: "contact", arama: "recherche", "teklif-listem": "liste-de-devis", sepetim: "panier", odeme: "paiement", blog: "blog", sss: "faq", "siparisim-ne-durumda": "suivi-de-commande", "odeme-bildirimi": "avis-de-paiement", "banka-hesaplari": "comptes-bancaires" },
  ru: { urun: "produkt", kategori: "kategoriya", sayfa: "stranica", iletisim: "kontakty", arama: "poisk", "teklif-listem": "spisok-zaprosa", sepetim: "korzina", odeme: "oplata", blog: "blog", sss: "faq", "siparisim-ne-durumda": "status-zakaza", "odeme-bildirimi": "uvedomlenie-ob-oplate", "banka-hesaplari": "bankovskie-scheta" },
  ar: { urun: "product", kategori: "category", sayfa: "page", iletisim: "contact", arama: "search", "teklif-listem": "quote-list", sepetim: "cart", odeme: "checkout", blog: "blog", sss: "faq", "siparisim-ne-durumda": "order-status", "odeme-bildirimi": "payment-notice", "banka-hesaplari": "bank-accounts" },
};

const reverse = (locale: Locale): Record<string, string> => Object.fromEntries(Object.entries(SEGMENTS[locale]).map(([internal, pub]) => [pub, internal]));

/**
 * Internal path → public path. localizePath("tr", "/urun/x") → "/urun/x"; localizePath("en", "/urun/x") → "/en/product/x".
 */
export function localizePath(locale: Locale, internalPath: string): string {
  const [pathOnly = "/", ...rest] = internalPath.split(/(?=[?#])/);
  const parts = pathOnly.split("/").filter(Boolean);
  if (parts.length > 0) parts[0] = SEGMENTS[locale][parts[0]!] ?? parts[0]!;
  const segments = locale === DEFAULT_LOCALE ? parts : [locale, ...parts];
  return `/${segments.join("/")}${rest.join("")}`;
}

/**
 * Public path → locale + internal path. "/en/product/x" → { locale: "en", internalPath: "/urun/x" }.
 * A prefixed DEFAULT_LOCALE ("/tr/...") is reported via `redundantPrefix` so the proxy can 308 it away.
 */
export function resolvePublicPath(pathname: string): { locale: Locale; internalPath: string; redundantPrefix: boolean } {
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];
  const hasPrefix = Boolean(first) && isLocale(first);
  const locale = hasPrefix ? (first as Locale) : DEFAULT_LOCALE;
  const rest = hasPrefix ? parts.slice(1) : [...parts];
  if (rest.length > 0) rest[0] = reverse(locale)[rest[0]!] ?? rest[0]!;
  return { locale, internalPath: `/${rest.join("/")}`, redundantPrefix: hasPrefix && locale === DEFAULT_LOCALE };
}
