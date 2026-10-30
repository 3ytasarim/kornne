import type { MetadataRoute } from "next";
import { catalog, CATALOG_DATA_VERIFIED } from "@/lib/catalog";
import { getFaq, getPublishedPage, listBlogPosts, listPublishedPaths } from "@/lib/cms/store";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { getSiteUrl, isIndexable, seoLocales } from "@/lib/seo/site";

export const revalidate = 3600;

/**
 * Multilingual sitemap (Sprint 8): ONLY 200 + indexable + canonical URLs, with hreflang alternates and image entries.
 *  - empty until the site is indexable AND catalog data is verified — staging never advertises URLs
 *  - a language appears only when it is an SEO locale (seoLocales) AND the entity really exists in it
 *  - lastmod = real `updatedAt` / `publishedAt` from the database; omitted when unknown (never "now")
 *  - search, cart, checkout, contact (noindex) and paginated listing pages are not listed
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable() || !CATALOG_DATA_VERIFIED) return [];
  const site = getSiteUrl();
  const seo = seoLocales();
  const abs = (l: Locale, p: string) => `${site}${localizePath(l, p)}`;
  const langs = (m: Partial<Record<Locale, string>>) => {
    const e = Object.entries(m).filter(([l]) => seo.includes(l as Locale));
    return e.length >= 2 ? { languages: Object.fromEntries(e) } : undefined;
  };
  const out: MetadataRoute.Sitemap = [];
  const products = await catalog.listProducts("tr");
  const newest = products.reduce<Date | undefined>((a, p) => (p.updatedAt && (!a || p.updatedAt > a) ? p.updatedAt : a), undefined);

  const home = Object.fromEntries(seo.map((l) => [l, abs(l, "/")]));
  for (const l of seo) out.push({ url: abs(l, "/"), lastModified: newest, alternates: langs(home) });

  for (const c of await catalog.listCategories("tr")) {
    const locs = c.translatedLocales.filter((l) => seo.includes(l));
    const urls = Object.fromEntries(locs.map((l) => [l, abs(l, `/kategori/${c.slugs[l]}`)]));
    const members = c.isAllProducts ? products : products.filter((p) => p.categoryKeys.includes(c.key));
    const last = [c.updatedAt, ...members.map((p) => p.updatedAt)].reduce<Date | undefined>((a, d) => (d && (!a || d > a) ? d : a), undefined);
    for (const l of locs) out.push({ url: urls[l]!, lastModified: last, alternates: langs(urls) });
  }

  for (const p of products) {
    const locs = p.translatedLocales.filter((l) => seo.includes(l));
    const urls = Object.fromEntries(locs.map((l) => [l, abs(l, `/urun/${p.slugs[l]}`)]));
    for (const l of locs) out.push({ url: urls[l]!, lastModified: p.updatedAt ?? undefined, images: p.images.map((i) => `${site}${i.src}`), alternates: langs(urls) });
  }

  // CMS: published pages / posts with their own text in that language; unapproved legal texts are excluded (noindex)
  for (const section of ["page", "blog"] as const) {
    for (const { locale, slug } of await listPublishedPaths(section)) {
      if (!seo.includes(locale)) continue;
      const page = await getPublishedPage(locale, section, slug);
      if (!page || page.contentStatus !== "own" || (page.kind === "LEGAL" && !page.legalApproved)) continue;
      const seg = section === "blog" ? "/blog" : "/sayfa";
      out.push({ url: abs(locale, `${seg}/${slug}`), lastModified: page.publishedAt ?? undefined, alternates: langs(Object.fromEntries(Object.entries(page.ownSlugs).map(([l, s]) => [l, abs(l as Locale, `${seg}/${s}`)]))) });
    }
  }
  // listing pages that are indexable only when they have content (same rule as their generateMetadata)
  for (const l of seo) {
    if ((await listBlogPosts(l)).length) out.push({ url: abs(l, "/blog") });
    if ((await getFaq(l)).length) out.push({ url: abs(l, "/sss") });
  }
  return out;
}
