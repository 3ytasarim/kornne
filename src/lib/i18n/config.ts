/**
 * Locale settings. Adapted from the Mezbaha-Teknolojileri i18n config (same team, own code) — see
 * docs/design/component-reuse.md.
 *
 * Turkish is the DEFAULT locale and keeps the legacy, already-indexed URLs without a prefix
 * (/urun/x, /kategori/x, /sayfa/x). Other locales get a prefix (/en/..., /ar/...).
 *
 * DEFAULT_LOCALE (routing, no prefix) and CANONICAL_LOCALE (language of the base catalog records) are separate
 * concepts — today both are "tr", but never use one in place of the other.
 */
export const LOCALES = ["tr", "en", "fr", "ru", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "tr";
export const CANONICAL_LOCALE: Locale = "tr";

/** Locales routed by the proxy. A locale is listed here only when its UI dictionary exists. */
export const ENABLED_LOCALES: readonly Locale[] = ["tr", "en", "fr", "ru", "ar"];

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export const LOCALE_META: Record<Locale, { label: string; nativeName: string; ogLocale: string; intl: string }> = {
  tr: { label: "TR", nativeName: "Türkçe", ogLocale: "tr_TR", intl: "tr-TR" },
  en: { label: "EN", nativeName: "English", ogLocale: "en_US", intl: "en-US" },
  fr: { label: "FR", nativeName: "Français", ogLocale: "fr_FR", intl: "fr-FR" },
  ru: { label: "RU", nativeName: "Русский", ogLocale: "ru_RU", intl: "ru-RU" },
  ar: { label: "AR", nativeName: "العربية", ogLocale: "ar_AR", intl: "ar" },
};

export const isLocale = (value: string | undefined | null): value is Locale => !!value && (LOCALES as readonly string[]).includes(value);
export const isEnabledLocale = (value: string | undefined | null): value is Locale => isLocale(value) && ENABLED_LOCALES.includes(value);
export const dirOf = (locale: Locale): "ltr" | "rtl" => (RTL_LOCALES.includes(locale) ? "rtl" : "ltr");

/** Request header set by the proxy on every locale rewrite (used by param-less files such as not-found). */
export const LOCALE_HEADER = "x-kornne-locale";
