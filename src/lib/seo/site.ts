/** Absolute public origin without trailing slash. */
export function getSiteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3460").replace(/\/+$/, "");
}

/**
 * Indexing gate. Only a production cutover with SITE_INDEXABLE=true may be indexed; every other environment
 * (local, staging, preview) is noindex via meta robots, X-Robots-Tag (proxy) and robots.txt.
 */
import { ENABLED_LOCALES, isEnabledLocale, type Locale } from "@/lib/i18n/config";

/**
 * Languages whose pages may be indexed. Since 2026-11 every enabled language has full catalogue translations, so the
 * default is ALL enabled locales; an environment can still restrict it (SEO_LOCALES="en,tr").
 */
export function seoLocales(): Locale[] {
  const raw = process.env.SEO_LOCALES?.trim();
  const list = (raw ? raw.split(",") : [...ENABLED_LOCALES]).map((s) => s.trim()).filter(isEnabledLocale);
  return list.length ? list : [...ENABLED_LOCALES];
}

export function isIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}
