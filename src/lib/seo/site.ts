/** Absolute public origin without trailing slash. */
export function getSiteUrl(): string {
  return (process.env.SITE_URL || "http://localhost:3460").replace(/\/+$/, "");
}

/**
 * Indexing gate. Only a production cutover with SITE_INDEXABLE=true may be indexed; every other environment
 * (local, staging, preview) is noindex via meta robots, X-Robots-Tag (proxy) and robots.txt.
 */
import { isEnabledLocale, type Locale } from "@/lib/i18n/config";

/**
 * Languages whose pages may be indexed (Sprint 8 SEO policy). EN/FR/RU/AR currently have UI translations only — the
 * catalog/CMS texts are not approved (74 legacy matches pending, no RU/AR content) — so their pages stay noindex and
 * out of hreflang until the client approves real translations. Per environment: SEO_LOCALES="tr,en".
 */
export function seoLocales(): Locale[] {
  const list = (process.env.SEO_LOCALES ?? "tr").split(",").map((s) => s.trim()).filter(isEnabledLocale);
  return list.length ? list : ["tr"];
}

export function isIndexable(): boolean {
  return process.env.SITE_INDEXABLE === "true";
}
