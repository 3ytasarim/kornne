import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/**
 * Localized first URL segment. Internal (file-system) route names are Turkish and equal to the legacy
 * kornne.com paths (urun, kategori, sayfa, iletisim, ...). Only the first segment is translated; entity
 * slugs come from the translation tables. Adapted from Mezbaha-Teknolojileri src/lib/i18n/routes.ts.
 */
export const SEGMENTS: Record<Locale, Record<string, string>> = {
  tr: {},
  en: { urun: "product", kategori: "category", sayfa: "page", iletisim: "contact", arama: "search", "teklif-listem": "quote-list", sepetim: "cart", odeme: "checkout", blog: "blog", sss: "faq", "siparisim-ne-durumda": "order-status", "odeme-bildirimi": "payment-notice", "banka-hesaplari": "bank-accounts" },
  de: { urun: "produkt", kategori: "kategorie", sayfa: "seite", iletisim: "kontakt", arama: "suche", "teklif-listem": "angebotsliste", sepetim: "warenkorb", odeme: "kasse", blog: "blog", sss: "faq", "siparisim-ne-durumda": "bestellstatus", "odeme-bildirimi": "zahlungsmeldung", "banka-hesaplari": "bankverbindungen" },
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
 * A prefixed DEFAULT_LOCALE ("/en/...") is reported via `redundantPrefix` so the proxy can 308 it away.
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

/** Turkish route segments that differ from the English ones (urun, kategori, sayfa, …). */
const TURKISH_ONLY_SEGMENTS = new Set(Object.entries(SEGMENTS.en).filter(([tr, en]) => tr !== en).map(([tr]) => tr));

/**
 * Until 2026-11 Turkish was the unprefixed locale, so Google and links still know "/urun/x", "/kategori/x",
 * "/sayfa/x"… An unprefixed path that starts with a Turkish-only segment is such an old Turkish URL → its new address
 * is the same path under "/tr". Returns null for anything else (English URLs, prefixed URLs, "/").
 */
export function legacyTurkishPath(pathname: string): string | null {
  const first = pathname.split(/[/?#]/).filter(Boolean)[0];
  if (!first || isLocale(first) || !TURKISH_ONLY_SEGMENTS.has(first)) return null;
  return `/tr${pathname}`;
}

/**
 * Legacy redirect targets (DB Redirect table, src/data/redirects.json) were written for the pre-2026-11 scheme —
 * bare Turkish paths and "/en/..." English paths. Returns today's canonical public URL for such a target so every
 * legacy 301 still lands in ONE hop. Query/hash are kept; external/odd values are returned unchanged.
 */
export function canonicalRedirectTarget(to: string): string {
  const old = legacyTurkishPath(to) ?? to;
  if (!old.startsWith("/")) return old;
  const [path = "/", ...rest] = old.split(/(?=[?#])/);
  const { locale, internalPath } = resolvePublicPath(path);
  return localizePath(locale, internalPath) + rest.join("");
}

/**
 * Every spelling a page's public path had over time: today's URL plus the pre-2026-11 one (Turkish unprefixed,
 * English with "/en"). Redirect rows written before the switch use the old spelling, so slug changes must match both
 * when they re-point redirects or check for a clashing redirect source.
 */
export function pathVariants(locale: Locale, internalPath: string): string[] {
  const now = localizePath(locale, internalPath);
  const parts = now.split("/").filter(Boolean);
  const old = locale === "tr" ? `/${parts.slice(1).join("/")}` : locale === "en" ? `/en${now === "/" ? "" : now}` : null;
  return old && old !== now ? [now, old] : [now];
}
