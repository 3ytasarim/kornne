import type { Locale } from "@/lib/i18n/config";

/** source = Turkish legacy text · legacy-translation = approved EN/FR legacy record · missing = Turkish fallback */
export type ContentStatus = "source" | "legacy-translation" | "missing";

export type CatalogImage = { src: string; alt: string; width: number | null; height: number | null };

export type CatalogCategory = {
  key: string;
  isAllProducts: boolean;
  name: string;
  slug: string;
  /** Slug per locale (for hreflang / language switcher) */
  slugs: Partial<Record<Locale, string>>;
  /** Locales whose category name is source/approved (hreflang + indexability); IN_REVIEW names are shown but noindex */
  translatedLocales: Locale[];
  /** Number of PUBLIC products (hidden / review-held records are not counted) */
  productCount: number;
  /** Count the legacy storefront displayed (audit comparison only) */
  legacyReportedTotal: string;
  /** editor SEO fields (null → generated) */
  seoTitle: string | null;
  seoDescription: string | null;
  description: string | null;
  /** Real last change (category row) — sitemap lastmod; null when unknown (snapshot) */
  updatedAt: Date | null;
};

export type CatalogVariant = { groupLabel: string; options: { id: string; label: string }[] };

export type CatalogProduct = {
  /** Stable source id (legacy kornne.com urun-id) */
  /** internal id (admin links, product Q&A) */
  id: string;
  sourceId: string;
  /** editor-chosen related products (sourceIds); empty → same-category fallback */
  relatedSourceIds: string[];
  /** editor SEO fields of the language shown (null → title / description excerpt) */
  seoTitle: string | null;
  seoDescription: string | null;
  slug: string;
  slugs: Partial<Record<Locale, string>>;
  title: string;
  /** Sanitized HTML */
  descriptionHtml: string;
  descriptionText: string;
  contentStatus: ContentStatus;
  /** Locales whose product page really exists (source or approved translation) — the only hreflang alternates */
  translatedLocales: Locale[];
  /** Locale of the page a card links to: the current locale when translated, otherwise Turkish (controlled fallback) */
  pageLocale: Locale;
  images: CatalogImage[];
  /** ISO code of priceMinor: the stored price currency, converted to the page language's display currency by catalog (index.ts) */
  currency: string;
  /** Customer-facing price — null unless the price is VERIFIED (VAT/currency/amount confirmed). */
  priceMinor: bigint | null;
  compareAtMinor: bigint | null;
  priceVerified: boolean;
  /** real stock / supply state of the product (Admin › Stok); null = unknown → no Offer is emitted */
  availability: "IN_STOCK" | "OUT_OF_STOCK" | "PREORDER" | "BACKORDER" | "MADE_TO_ORDER" | null;
  /** admin-entered lead time in days (made to order: production + dispatch); null = unknown */
  leadTimeDays: number | null;
  /** verified brand name and real identifiers only (never invented) — Product structured data */
  brandName: string | null;
  mpn: string | null;
  gtin: string | null;
  /** VAT treatment of the verified price (null = unknown → a verified price always carries it) */
  vatIncluded: boolean | null;
  categoryKeys: string[];
  primaryCategoryKey: string | null;
  variants: CatalogVariant[];
  /** VERIFIED technical specs only (ProductSpec.status) — empty today; never filled with guessed values */
  specs: { key: string; label: string; value: string; unit: string | null }[];
  /** Real downloadable documents only (none on the legacy site) */
  documents: { url: string; label: string }[];
  sortOrder: number;
  sourceUrl: string;
  flags: string[];
  /** Real last change of the product or the shown translation — sitemap lastmod; null when unknown (snapshot) */
  updatedAt: Date | null;
};

/**
 * Read API used by the storefront. Sprint 1: audit snapshot (snapshot-repository.ts, still used by unit tests and
 * the importer comparison). Sprint 3: Prisma/Neon (prisma-repository.ts).
 */
export interface CatalogRepository {
  listCategories(locale: Locale): Promise<CatalogCategory[]>;
  getCategory(locale: Locale, slug: string): Promise<{ category: CatalogCategory; products: CatalogProduct[] } | null>;
  /** Only products whose page exists in `locale` (public + translated) */
  getProduct(locale: Locale, slug: string): Promise<CatalogProduct | null>;
  /** Public products for listings in `locale` (untranslated ones fall back to Turkish content + Turkish page) */
  listProducts(locale: Locale): Promise<CatalogProduct[]>;
  search(locale: Locale, query: string): Promise<CatalogProduct[]>;
}
