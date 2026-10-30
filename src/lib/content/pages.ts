import "server-only";
import catalog from "@/data/source-snapshot/catalog.json";
import type { Locale } from "@/lib/i18n/config";
import { sanitizeRichText } from "@/lib/catalog/sanitize";

/**
 * CMS pages (Sprint 1: legacy snapshot; Sprint 7: Page/PageTranslation tables).
 * Legal texts exist only in Turkish on the source site and need legal approval before launch.
 * Legacy EN/FR/RU/AR corporate pages have an empty body → Turkish text + visible "translation missing" notice.
 */
export type CmsPageKey = "kurumsal" | "iade-ve-geri-odeme-politikalari" | "mesafeli-satis-sozlesmesi" | "kisisel-verilenin-korunmasi-kanunu";

export const CMS_PAGES: Record<CmsPageKey, { kind: "CORPORATE" | "LEGAL"; slugs: Partial<Record<Locale, string>>; legacySlugs: Partial<Record<Locale, string>> }> = {
  kurumsal: {
    kind: "CORPORATE",
    slugs: { tr: "kurumsal", en: "corporate-information", fr: "information-dentreprise", ru: "o-kompanii", ar: "about-us" },
    legacySlugs: { tr: "kurumsal", en: "corporate-information", fr: "information-dentreprise", ru: "lang-russian-corparate", ar: "lang-arabic-corparate" },
  },
  "iade-ve-geri-odeme-politikalari": { kind: "LEGAL", slugs: { tr: "iade-ve-geri-odeme-politikalari" }, legacySlugs: { tr: "iade-ve-geri-odeme-politikalari" } },
  "mesafeli-satis-sozlesmesi": { kind: "LEGAL", slugs: { tr: "mesafeli-satis-sozlesmesi" }, legacySlugs: { tr: "mesafeli-satis-sozlesmesi" } },
  "kisisel-verilenin-korunmasi-kanunu": { kind: "LEGAL", slugs: { tr: "kisisel-verilenin-korunmasi-kanunu" }, legacySlugs: { tr: "kisisel-verilenin-korunmasi-kanunu" } },
};

export type CmsPage = { key: CmsPageKey; kind: "CORPORATE" | "LEGAL"; title: string; bodyHtml: string; bodyText: string; contentStatus: "source" | "missing"; slugs: Partial<Record<Locale, string>>; sourceUrl: string };

export function findCmsPage(locale: Locale, slug: string): CmsPage | null {
  const entry = (Object.entries(CMS_PAGES) as [CmsPageKey, (typeof CMS_PAGES)[CmsPageKey]][]).find(([, p]) => p.slugs[locale] === slug);
  if (!entry) return null;
  const [key, def] = entry;
  const legacy = catalog.pages.find((p) => p.locale === locale && p.slug === def.legacySlugs[locale]);
  const tr = catalog.pages.find((p) => p.locale === "tr" && p.slug === def.legacySlugs.tr);
  const own = legacy && legacy.body_text.trim().length > 40 ? legacy : null;
  const src = own ?? tr;
  if (!src) return null;
  return {
    key,
    kind: def.kind,
    title: legacy?.title || src.title,
    bodyHtml: sanitizeRichText(src.body_html),
    bodyText: src.body_text,
    contentStatus: own || locale === "tr" ? "source" : "missing",
    slugs: def.slugs,
    sourceUrl: src.source_url,
  };
}
