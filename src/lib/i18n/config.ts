/**
 * Locale settings (same model as the Mezbaha-Teknolojileri sites).
 *
 * Since 2026-11 ENGLISH is the DEFAULT (routing) locale: English pages have no prefix (/product/x, /category/x),
 * every other language is prefixed (/tr/urun/x, /de/produkt/x, /ar/product/x). Pre-2026-11 Turkish URLs had no
 * prefix (/urun/x) — the proxy 301s them to /tr/... (see legacyTurkishPath in routes.ts).
 *
 * DEFAULT_LOCALE (routing, no prefix) and CANONICAL_LOCALE (language of the base catalog records: Turkish source
 * texts, legacy slugs, imports) are separate concepts — never use one in place of the other.
 */
export const LOCALES = ["en", "tr", "de", "fr", "ru", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const CANONICAL_LOCALE: Locale = "tr";

/** Locales routed by the proxy (switcher order). A locale is listed here only when its UI dictionary exists. */
export const ENABLED_LOCALES: readonly Locale[] = ["en", "tr", "de", "fr", "ru", "ar"];

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export const LOCALE_META: Record<Locale, { label: string; nativeName: string; ogLocale: string; intl: string }> = {
  tr: { label: "TR", nativeName: "Türkçe", ogLocale: "tr_TR", intl: "tr-TR" },
  en: { label: "EN", nativeName: "English", ogLocale: "en_US", intl: "en-US" },
  de: { label: "DE", nativeName: "Deutsch", ogLocale: "de_DE", intl: "de-DE" },
  fr: { label: "FR", nativeName: "Français", ogLocale: "fr_FR", intl: "fr-FR" },
  ru: { label: "RU", nativeName: "Русский", ogLocale: "ru_RU", intl: "ru-RU" },
  ar: { label: "AR", nativeName: "العربية", ogLocale: "ar_AR", intl: "ar" },
};

export const isLocale = (value: string | undefined | null): value is Locale => !!value && (LOCALES as readonly string[]).includes(value);
export const isEnabledLocale = (value: string | undefined | null): value is Locale => isLocale(value) && ENABLED_LOCALES.includes(value);
export const dirOf = (locale: Locale): "ltr" | "rtl" => (RTL_LOCALES.includes(locale) ? "rtl" : "ltr");

/** Request header set by the proxy on every locale rewrite (used by param-less files such as not-found). */
export const LOCALE_HEADER = "x-kornne-locale";
