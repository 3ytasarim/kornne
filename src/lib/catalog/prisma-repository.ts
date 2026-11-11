import "server-only";
import { prisma } from "@/lib/db";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import type { CatalogCategory, CatalogImage, CatalogProduct, CatalogRepository, ContentStatus } from "./types";

/**
 * Storefront catalog from Neon. The whole public catalog (41 products) is read in ONE round of queries and
 * memoised for a short TTL per process — pages are SSG/ISR, so the DB is hit at build/revalidate time only.
 *
 * Visibility rules (docs/data-migration/source-to-target-map.md):
 *  - public = Product.status PUBLISHED && !needsReview (review-held records, e.g. #208, never appear)
 *  - a product page exists in a locale only with a translation in status LEGACY_SOURCE or APPROVED
 *  - listings in other locales show Turkish content and link to the Turkish page (controlled fallback)
 *  - prices are exposed only when Price.status = VERIFIED (none are today)
 */
const TTL_MS = 60_000;
const PAGE_STATUSES = new Set(["LEGACY_SOURCE", "APPROVED"]);
const CATEGORY_PRIORITY = ["mezbaha-ekipmanlari", "kurban-ekipmanlari", "robotik-sistemler"];

async function query() {
  const db = prisma;
  if (!db) throw new Error("DATABASE_URL is not configured — the catalog needs the KORNNE database");
  const [categories, products, legacyTotals] = await Promise.all([
    db.category.findMany({ where: { status: "PUBLISHED" }, include: { translations: true }, orderBy: { sortOrder: "asc" } }),
    db.product.findMany({
      where: { status: "PUBLISHED", needsReview: false },
      orderBy: [{ sortOrder: "asc" }, { sourceKey: "asc" }],
      include: {
        translations: true,
        categories: { include: { category: { select: { key: true } } } },
        media: { orderBy: { sortOrder: "asc" }, include: { media: { include: { translations: true } } } },
        variants: { where: { active: true }, orderBy: { sortOrder: "asc" } },
        specs: { where: { status: "VERIFIED" }, orderBy: { sortOrder: "asc" } },
        documents: { where: { status: "VERIFIED" }, orderBy: { sortOrder: "asc" } },
        related: { where: { kind: "related", to: { status: "PUBLISHED", needsReview: false } }, select: { to: { select: { sourceKey: true, id: true } } } },
        prices: { where: { status: "VERIFIED", variantId: null, validFrom: { lte: new Date() }, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }, orderBy: { validFrom: "desc" }, take: 1 },
      },
    }),
    db.legacySourceRecord.findMany({ where: { entityType: "category", locale: "tr" }, select: { payload: true } }),
  ]);
  return { categories, products, legacyTotals };
}
type Raw = Awaited<ReturnType<typeof query>>;

// on globalThis: server actions and pages can be separate bundles in the SAME process — one shared memo
const g = globalThis as unknown as { __kornneCatalog?: { at: number; data: Promise<Raw> } | null };
function load(): Promise<Raw> {
  if (!g.__kornneCatalog || Date.now() - g.__kornneCatalog.at > TTL_MS) {
    const data = query();
    g.__kornneCatalog = { at: Date.now(), data };
    data.catch(() => (g.__kornneCatalog = null));
  }
  return g.__kornneCatalog.data;
}

/** Drop the per-process memo (admin approvals must be visible immediately, before the TTL). */
export function invalidateCatalog() {
  g.__kornneCatalog = null;
}

const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const imageSrc = (publicPath: string) => `/upload/${publicPath.replace(/^\/upload\//, "").split("/").map(encodeURIComponent).join("/")}`;

function toProduct(locale: Locale, p: Raw["products"][number]): CatalogProduct {
  const byLocale = new Map(p.translations.map((t) => [t.locale as Locale, t]));
  const tr = byLocale.get("tr")!;
  const own = byLocale.get(locale);
  const hasPage = (l: Locale) => {
    const t = byLocale.get(l);
    return !!t && PAGE_STATUSES.has(t.status);
  };
  const translated = locale !== "tr" && hasPage(locale);
  const content = translated ? own! : tr;
  const contentStatus: ContentStatus = locale === "tr" ? "source" : translated ? "legacy-translation" : "missing";
  const slugs = Object.fromEntries(LOCALES.filter(hasPage).map((l) => [l, byLocale.get(l)!.slug])) as Partial<Record<Locale, string>>;
  const images: CatalogImage[] = p.media.map(({ media }, i) => {
    // translated pages never fall back to the Turkish alt text: use the translated product title instead
    const alt = translated
      ? (media.translations.find((t) => t.locale === locale)?.alt ?? (i === 0 ? content.title : `${content.title} (${i + 1})`))
      : (media.translations.find((t) => t.locale === "tr")?.alt ?? content.title);
    return { src: imageSrc(media.publicPath), alt, width: media.width, height: media.height };
  });
  const keys = p.categories.map((c) => c.category.key);
  const primary = p.categories.find((c) => c.isPrimary)?.category.key ?? CATEGORY_PRIORITY.find((k) => keys.includes(k)) ?? null;
  const price = p.prices[0];
  return {
    id: p.id,
    sourceId: (p.sourceKey ?? p.id).split(":").pop()!,
    seoTitle: content.seoTitle,
    seoDescription: content.seoDescription,
    relatedSourceIds: p.related.map((r) => (r.to.sourceKey ?? r.to.id).split(":").pop()!),
    slug: content.slug,
    slugs,
    title: content.title,
    descriptionHtml: content.descriptionHtml ?? "",
    descriptionText: textOf(content.descriptionHtml ?? ""),
    contentStatus,
    translatedLocales: LOCALES.filter(hasPage),
    pageLocale: translated || locale === "tr" ? locale : "tr",
    images,
    currency: price ? price.currency : "TRY",
    priceMinor: price ? price.amountMinor : null,
    compareAtMinor: price ? price.compareAtMinor : null,
    priceVerified: !!price,
    vatIncluded: price ? price.vatIncluded : null,
    categoryKeys: keys,
    primaryCategoryKey: primary,
    variants: p.variants.length ? [{ groupLabel: "", options: p.variants.map((v) => ({ id: v.id, label: (v.labels as Record<string, string>)[locale] ?? (v.labels as Record<string, string>).tr ?? "" })) }] : [],
    sortOrder: p.sortOrder,
    specs: p.specs.map((sp) => {
      const pick = (j: unknown) => ((j as Record<string, string>)[translated ? locale : "tr"] ?? (j as Record<string, string>).tr ?? "");
      return { key: sp.key, label: pick(sp.labels), value: pick(sp.values), unit: sp.unit };
    }),
    documents: p.documents.filter((doc) => !doc.locale || doc.locale === locale || doc.locale === (translated ? locale : "tr")).map((doc) => ({ url: doc.publicPath, label: doc.title })),
    sourceUrl: "",
    flags: p.reviewReasons,
    updatedAt: new Date(Math.max(p.updatedAt.getTime(), content.updatedAt.getTime())),
  };
}

async function view(locale: Locale) {
  const raw = await load();
  const products = raw.products.map((p) => toProduct(locale, p));
  const totals = new Map(raw.legacyTotals.map((r) => [(r.payload as { key?: string }).key, (r.payload as { reported_total?: string }).reported_total ?? ""]));
  const categories: CatalogCategory[] = raw.categories
    .map((c) => {
      const t = c.translations.find((x) => x.locale === locale) ?? c.translations.find((x) => x.locale === "tr");
      if (!t) return null;
      return {
        key: c.key,
        isAllProducts: c.isAllProducts,
        name: t.name,
        slug: t.slug,
        slugs: Object.fromEntries(c.translations.map((x) => [x.locale, x.slug])) as Partial<Record<Locale, string>>,
        translatedLocales: LOCALES.filter((l) => c.translations.some((x) => x.locale === l && PAGE_STATUSES.has(x.status))),
        productCount: c.isAllProducts ? products.length : products.filter((p) => p.categoryKeys.includes(c.key)).length,
        legacyReportedTotal: totals.get(c.key) ?? "",
        seoTitle: t.locale === locale ? t.seoTitle : null,
        seoDescription: t.locale === locale ? t.seoDescription : null,
        description: t.locale === locale ? t.description : null,
        updatedAt: c.updatedAt as Date | null,
      };
    })
    .filter((c): c is CatalogCategory => c !== null);
  return { products, categories };
}

const fold = (s: string, locale: Locale) => s.toLocaleLowerCase(locale === "tr" ? "tr" : locale).normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i");

export const prismaRepository: CatalogRepository = {
  async listCategories(locale) {
    return (await view(locale)).categories;
  },
  async getCategory(locale, slug) {
    const { categories, products } = await view(locale);
    const category = categories.find((c) => c.slug === slug);
    if (!category) return null;
    return { category, products: category.isAllProducts ? products : products.filter((p) => p.categoryKeys.includes(category.key)) };
  },
  async getProduct(locale, slug) {
    const { products } = await view(locale);
    return products.find((p) => p.pageLocale === locale && p.slug === slug) ?? null;
  },
  async listProducts(locale) {
    return (await view(locale)).products;
  },
  async search(locale, q) {
    const query = fold(q.trim(), locale);
    if (query.length < 2) return [];
    const terms = query.split(/\s+/).filter(Boolean);
    const { products, categories } = await view(locale);
    const catName = new Map(categories.map((c) => [c.key, c.name]));
    // title matches first, then description matches
    const scored = products
      .map((p) => {
        const title = fold(p.title, locale);
        const hay = `${title} ${fold(p.descriptionText, locale)} ${fold(p.categoryKeys.map((k) => catName.get(k) ?? "").join(" "), locale)}`;
        if (!terms.every((t) => hay.includes(t))) return null;
        return { p, score: terms.filter((t) => title.includes(t)).length * 10 - p.sortOrder / 1000 };
      })
      .filter((x): x is { p: CatalogProduct; score: number } => x !== null);
    return scored.sort((a, b) => b.score - a.score).map((x) => x.p);
  },
};
