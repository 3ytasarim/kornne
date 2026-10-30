import type { PrismaClient } from "@prisma/client";
import { ENABLED_LOCALES, dirOf, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { PAGE_SIZE } from "@/lib/catalog/pagination";
import type { PageExpect } from "./audit";

/**
 * Route inventory for the SEO audit (Sprint 8), built from the REAL database (read-only queries): every public route
 * family in every enabled language, every product / category / CMS translation, every legacy redirect (Redirect
 * table: 125 × 301) and every review-held product (#208 → 307). The expectations encode the SEO policy:
 *  - indexable (production) = SEO locale ∧ entity really translated ∧ not a utility page (search/cart/checkout/contact)
 *  - untranslated product URL in another language → 404 (no fake page)
 * `verified` = whether the target server runs with CATALOG_DATA_VERIFIED (catalog pages are noindex otherwise).
 */
const PUBLISHED_PAGE = new Set(["LEGACY_SOURCE", "APPROVED"]);

export async function buildInventory(db: PrismaClient, opts: { seoLocales: Locale[]; verified: boolean; redirectSample?: number }): Promise<PageExpect[]> {
  const seo = (l: Locale) => opts.seoLocales.includes(l);
  const out: PageExpect[] = [];
  const page = (e: Omit<PageExpect, "lang" | "dir"> & { locale?: Locale }) => {
    const { locale, ...rest } = e;
    out.push(locale ? { ...rest, lang: locale, dir: dirOf(locale) } : rest);
  };

  const [categories, products, pages, faq, redirects] = await Promise.all([
    db.category.findMany({ where: { status: "PUBLISHED" }, select: { key: true, isAllProducts: true, translations: { select: { locale: true, slug: true, status: true } }, products: { select: { product: { select: { status: true, needsReview: true } } } } } }),
    db.product.findMany({ select: { id: true, sourceKey: true, status: true, needsReview: true, translations: { select: { locale: true, slug: true, status: true } }, categories: { where: { isPrimary: true }, select: { category: { select: { translations: { select: { locale: true, slug: true } } } } } } } }),
    db.pageTranslation.findMany({ where: { state: "PUBLISHED", publishedRevisionId: { not: null }, page: { status: { not: "ARCHIVED" } } }, select: { locale: true, publishedSlug: true, page: { select: { kind: true, legalApprovedAt: true } }, publishedRevision: { select: { bodyHtml: true } } } }),
    db.faqItem.groupBy({ by: ["locale"], where: { state: "PUBLISHED", productId: null }, _count: true }),
    db.redirect.findMany({ where: { active: true }, select: { fromPath: true, toPath: true, statusCode: true }, orderBy: { fromPath: "asc" } }),
  ]);
  const publicProducts = products.filter((p) => p.status === "PUBLISHED" && !p.needsReview);
  const catalogIdx = (l: Locale) => opts.verified && seo(l);

  for (const l of ENABLED_LOCALES) {
    page({ path: localizePath(l, "/"), kind: "home", status: 200, indexable: catalogIdx(l), locale: l });
    page({ path: `${localizePath(l, "/arama")}?q=kesim`, kind: "search", status: 200, indexable: false, locale: l });
    page({ path: localizePath(l, "/iletisim"), kind: "contact", status: 200, indexable: false, locale: l });
    page({ path: localizePath(l, "/teklif-listem"), kind: "quote", status: 200, indexable: false, locale: l });
    page({ path: localizePath(l, "/sepetim"), kind: "cart", status: 200, indexable: false, locale: l });
    page({ path: localizePath(l, "/odeme"), kind: "checkout", status: 200, indexable: false, locale: l });
    const faqCount = faq.find((f) => f.locale === l)?._count ?? 0;
    page({ path: localizePath(l, "/sss"), kind: "faq", status: faqCount ? 200 : 404, indexable: faqCount > 0 && seo(l), locale: l });
    const blogPosts = pages.filter((p) => p.locale === l && p.page.kind === "BLOG" && p.publishedRevision?.bodyHtml.trim()).length;
    page({ path: localizePath(l, "/blog"), kind: "blog", status: blogPosts ? 200 : 404, indexable: blogPosts > 0 && seo(l), locale: l });
    page({ path: localizePath(l, "/bu-sayfa-yok-seo-qa"), kind: "404", status: 404, locale: l });
  }

  for (const c of categories) {
    const count = c.isAllProducts ? publicProducts.length : c.products.filter((x) => x.product.status === "PUBLISHED" && !x.product.needsReview).length;
    const pagesN = Math.max(1, Math.ceil(count / PAGE_SIZE));
    for (const t of c.translations) {
      const l = t.locale as Locale;
      if (!ENABLED_LOCALES.includes(l)) continue;
      const base = localizePath(l, `/kategori/${t.slug}`);
      const idx = catalogIdx(l) && PUBLISHED_PAGE.has(t.status);
      page({ path: base, kind: "category", status: 200, indexable: idx, locale: l });
      for (let n = 2; n <= pagesN; n++) page({ path: `${base}/${n}`, kind: "category-page", status: 200, indexable: idx, locale: l });
      if (l === "tr") page({ path: `${base}?siralama=ad-artan`, kind: "category-filter", status: 200, canonicalPath: base, locale: l });
    }
  }

  for (const p of products) {
    const held = p.needsReview || p.status !== "PUBLISHED";
    for (const t of p.translations) {
      const l = t.locale as Locale;
      const path = localizePath(l, `/urun/${t.slug}`);
      if (held) {
        const cat = p.categories[0]?.category.translations.find((x) => x.locale === l);
        page({ path, kind: "held-product", status: 307, location: cat ? localizePath(l, `/kategori/${cat.slug}`) : localizePath(l, "/") });
      } else if (PUBLISHED_PAGE.has(t.status)) page({ path, kind: "product", status: 200, indexable: catalogIdx(l), locale: l });
    }
  }
  // an untranslated product must not exist in another language (sample: first public product, every other locale)
  const sample = publicProducts.find((p) => p.translations.length === 1);
  if (sample) for (const l of ENABLED_LOCALES.filter((x) => x !== "tr")) page({ path: localizePath(l, `/urun/${sample.translations[0]!.slug}`), kind: "product-missing-locale", status: 404 });

  for (const t of pages) {
    const l = t.locale as Locale;
    const seg = t.page.kind === "BLOG" ? "/blog" : "/sayfa";
    const own = !!t.publishedRevision?.bodyHtml.trim();
    const legal = t.page.kind === "LEGAL";
    page({ path: localizePath(l, `${seg}/${t.publishedSlug}`), kind: legal ? "legal" : own || l === "tr" ? "cms" : "cms-fallback", status: 200, indexable: seo(l) && (own || l === "tr") && (!legal || !!t.page.legalApprovedAt), locale: l });
  }

  const reds = opts.redirectSample ? redirects.slice(0, opts.redirectSample) : redirects;
  for (const r of reds) out.push({ path: r.fromPath, kind: "legacy-redirect", status: r.statusCode, location: r.toPath });

  page({ path: "/admin/login", kind: "admin", status: 200, indexable: false });
  return out;
}
