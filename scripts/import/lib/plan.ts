/**
 * Pure import planning: audit snapshot → desired target rows. No I/O, no database — unit tested.
 * Rules (docs/data-migration/source-to-target-map.md):
 *  - Turkish records are the source products. EN/FR records stay separate LegacySourceRecords and only become
 *    LegacyMatchSuggestions (confidence + evidence) — never auto-merged into a product.
 *  - Raw legacy values are kept verbatim in LegacySourceRecord.payload and Price.raw* columns.
 *  - Every price is UNVERIFIED (VAT / currency / amount not confirmed) → never customer-facing.
 */
import { sanitizeRichText } from "../../../src/lib/catalog/sanitize";
import type { SnapshotProduct, Sources } from "./sources";

export const SOURCE = "kornne.com";
export const LOCALES = ["tr", "en", "fr", "ru", "ar"] as const;

export { sha256, translationChecksum, categoryTranslationChecksum, altChecksum } from "../../../src/lib/catalog/checksum";
import { categoryTranslationChecksum, translationChecksum } from "../../../src/lib/catalog/checksum";

/** "1807479.94" → 180747994n. Only clean decimal strings; anything else → null (kept raw). */
export function decimalToMinor(dec: string): bigint | null {
  const m = /^(\d+)\.(\d{2})$/.exec(dec ?? "");
  return m ? BigInt(m[1]!) * 100n + BigInt(m[2]!) : null;
}

/** Detects typical UTF-8-as-Latin-1 mojibake ("Ã¼", "Ä±", "Å\u009f"). */
export function hasMojibake(s: string): boolean {
  return /Ã[\u0080-¿]|Ä[\u0080-¿]|Å[\u0080-¿]|Â[\u0080-¿]|�/.test(s);
}

const pathOf = (url: string) => decodeURIComponent(new URL(url).pathname);
const nameOf = (url: string) => pathOf(url).replace(/^\/upload\//, "");
const MIME: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

export type PlannedProduct = {
  sourceKey: string;
  legacyId: string;
  status: "PUBLISHED" | "DRAFT";
  needsReview: boolean;
  reviewReasons: string[];
  sortOrder: number;
  translation: { locale: "tr"; title: string; slug: string; descriptionHtml: string | null; status: "LEGACY_SOURCE"; checksum: string };
  categories: { key: string; isPrimary: boolean; sortOrder: number }[];
  images: { publicPath: string; sortOrder: number; isPrimary: boolean; alt: string }[];
  missingImages: string[];
  variants: { sourceKey: string; labels: Record<string, string>; sortOrder: number }[];
  price: { amountMinor: bigint; compareAtMinor: bigint | null; rawAmount: string; rawCompareAt: string | null; reviewReasons: string[] } | null;
};

export type PlannedMatch = { sourceLocale: "en" | "fr"; sourceLegacyId: string; productSourceKey: string; confidence: number; method: string; evidence: Record<string, unknown> };

export type Plan = ReturnType<typeof buildPlan>;

const PRIMARY_ORDER = ["mezbaha-ekipmanlari", "kurban-ekipmanlari", "robotik-sistemler"];

export function buildPlan(src: Sources) {
  const { catalog, localeMap } = src;
  const media = src.media;
  const okMedia = media.filter((m) => m.mirror_status === "ok");
  const mediaByUrl = new Map(media.map((m) => [m.url, m]));
  const shaByUrl = new Map(okMedia.map((m) => [m.url, m.sha256]));
  const featured = new Map(catalog.home_featured.map((s, i) => [s, i]));
  const allProductsKey = localeMap.categories.find((c) => c.isAllProducts)!.key;

  // ── categories (4, incl. virtual "all products") ──
  const categories = localeMap.categories.map((c, i) => ({
    key: c.key,
    isAllProducts: c.isAllProducts,
    sortOrder: i,
    translations: LOCALES.filter((l) => c.locales[l]).map((l) => {
      const v = c.locales[l]!;
      const name = l === "tr" ? (catalog.categories.find((x) => x.slug === c.key)?.title ?? v.name) : v.name;
      return { locale: l, name, slug: v.slug, status: (l === "tr" ? "LEGACY_SOURCE" : "IN_REVIEW") as "LEGACY_SOURCE" | "IN_REVIEW", checksum: categoryTranslationChecksum({ name, slug: v.slug }) };
    }),
  }));

  // ── products (Turkish source records) ──
  const products: PlannedProduct[] = catalog.products.map((p) => {
    const listedInAll = p.categories.includes(allProductsKey);
    const realCats = p.categories.filter((k) => k !== allProductsKey);
    const primary = PRIMARY_ORDER.find((k) => realCats.includes(k)) ?? realCats[0];
    const amountMinor = decimalToMinor(p.price);
    const compareAt = decimalToMinor(p.old_price);
    const priceReasons = ["vat_unknown", "currency_unconfirmed"];
    if (compareAt !== null && amountMinor !== null && compareAt <= amountMinor) priceReasons.push("invalid_discount_compare_at_not_higher");
    const title = p.title.normalize("NFC");
    const descriptionHtml = p.description_html ? sanitizeRichText(p.description_html).normalize("NFC") || null : null;
    const images: PlannedProduct["images"] = [];
    const missingImages: string[] = [];
    p.images.forEach((url) => {
      if (!shaByUrl.has(url)) {
        missingImages.push(url);
        return;
      }
      const n = images.length + 1;
      images.push({ publicPath: pathOf(url), sortOrder: n - 1, isPrimary: n === 1, alt: n === 1 ? title : `${title} – görsel ${n}` });
    });
    const reviewReasons = [...p.flags];
    if (!listedInAll) reviewReasons.push("not_listed_in_all_products_on_legacy_storefront");
    if (missingImages.length) reviewReasons.push("broken_image_at_source");
    return {
      sourceKey: `${SOURCE}:${p.source_id}`,
      legacyId: p.source_id,
      // A record the legacy "Tüm Ürünler" did not list is held back for a human decision (never auto-published).
      status: listedInAll ? "PUBLISHED" : "DRAFT",
      needsReview: !listedInAll,
      reviewReasons,
      sortOrder: featured.get(p.slug) ?? 100 + Number(p.source_id),
      translation: { locale: "tr", title, slug: p.slug, descriptionHtml, status: "LEGACY_SOURCE", checksum: translationChecksum({ title, slug: p.slug, descriptionHtml }) },
      categories: realCats.map((key, i) => ({ key, isPrimary: key === primary, sortOrder: i })),
      images,
      missingImages,
      variants: p.variants.flatMap((g) => g.options.map((o, i) => ({ sourceKey: `${SOURCE}:${p.source_id}:${o.id}`, labels: { tr: o.label }, sortOrder: i }))),
      price: amountMinor === null ? null : { amountMinor, compareAtMinor: compareAt, rawAmount: p.price_raw, rawCompareAt: p.old_price_raw || null, reviewReasons: priceReasons },
    };
  });

  // ── EN/FR → TR match suggestions (evidence-based confidence; never auto-applied) ──
  const trById = new Map(catalog.products.map((p) => [p.source_id, p]));
  const legacyById = new Map(catalog.translations.map((t) => [`${t.locale}:${t.source_id}`, t]));
  const matches: PlannedMatch[] = [];
  localeMap.products.forEach((row, orderIndex) => {
    for (const loc of ["en", "fr"] as const) {
      const id = row[loc];
      if (!id) continue;
      const tr = trById.get(row.tr)!;
      const lg = legacyById.get(`${loc}:${id}`);
      if (!lg) continue;
      matches.push(scoreMatch(loc, tr, lg, orderIndex, shaByUrl));
    }
  });
  // legacy EN/FR records that no suggestion covers would be reported (there are none today)
  const covered = new Set(matches.map((m) => `${m.sourceLocale}:${m.sourceLegacyId}`));
  const unmatchedLegacy = catalog.translations.filter((t) => !covered.has(`${t.locale}:${t.source_id}`)).map((t) => `${t.locale}:${t.source_id}`);

  // ── media assets (every mirrored original; byte-identical, same public path) ──
  const mediaAssets = okMedia.map((m) => ({
    storageKey: `originals/${m.filename}`,
    publicPath: pathOf(m.url),
    sourceUrl: m.url,
    sha256: m.sha256,
    mime: MIME[m.format] ?? "application/octet-stream",
    bytes: Number(m.bytes),
    width: m.width ? Number(m.width) : null,
    height: m.height ? Number(m.height) : null,
  }));
  const missingMedia = media.filter((m) => m.mirror_status !== "ok").map((m) => ({ url: m.url, status: m.http_status, usages: m.usages }));

  // ── legacy provenance records ──
  const pageSha = new Map(src.pages.map((r) => [`${r.session_lang}|${r.url}`, r.sha256]));
  const legacyRecords = [
    ...[...catalog.products, ...catalog.translations].map((p) => ({ entityType: "product", legacyId: p.source_id, locale: p.locale, sourceUrl: p.source_url, capturedAt: p.captured_at, pageSha256: p.page_sha256 || null, payload: p as unknown as Record<string, unknown> })),
    ...localeMap.categories.flatMap((c) =>
      Object.entries(c.locales).map(([l, v]) => ({ entityType: "category", legacyId: v.legacySlug, locale: l, sourceUrl: v.sourceUrl, capturedAt: catalog._meta.captured_at, pageSha256: pageSha.get(`${l}|${v.sourceUrl}`) ?? null, payload: { key: c.key, ...v } as Record<string, unknown> })),
    ),
    ...catalog.pages.map((p) => ({ entityType: "page", legacyId: p.slug, locale: p.locale, sourceUrl: p.source_url, capturedAt: p.captured_at, pageSha256: p.page_sha256, payload: p as unknown as Record<string, unknown> })),
    ...media.map((m) => ({ entityType: "media", legacyId: nameOf(m.url), locale: "tr", sourceUrl: m.url, capturedAt: catalog._meta.captured_at, pageSha256: null, payload: m as Record<string, unknown> })),
  ];

  // ── legacy redirects (301s from the audit map; EN/FR product URLs → locale listing until a match is approved) ──
  const seen = new Set<string>();
  const redirects = src.redirects
    .filter((r) => r.status === "301" && r.old_path.startsWith("/") && r.new_path)
    .filter((r) => (seen.has(r.old_path) ? false : (seen.add(r.old_path), true)))
    .map((r) => ({ fromPath: r.old_path, toPath: r.new_path, note: r.note || null }));

  return { sourceHash: src.sourceHash, categories, products, matches, unmatchedLegacy, mediaAssets, missingMedia, legacyRecords, redirects, mediaByUrl };
}

export function scoreMatch(loc: "en" | "fr", tr: SnapshotProduct, lg: SnapshotProduct, orderIndex: number, shaByUrl: Map<string, string>): PlannedMatch {
  const trSha = new Set(tr.images.map((u) => shaByUrl.get(u)).filter(Boolean));
  const sharedImages = lg.images.map((u) => shaByUrl.get(u)).filter((s) => s && trSha.has(s)).length;
  const priceEqual = !!tr.price && tr.price === lg.price;
  const oldEqual = !!tr.old_price && tr.old_price === lg.old_price;
  // weights: identical photo bytes are the strongest objective evidence; record order is weak
  let confidence = 20; // record order (EN/FR records were created in the same sequence as TR)
  if (sharedImages > 0) confidence += 45;
  if (priceEqual) confidence += 25;
  if (oldEqual) confidence += 10;
  return {
    sourceLocale: loc,
    sourceLegacyId: lg.source_id,
    productSourceKey: `${SOURCE}:${tr.source_id}`,
    confidence: Math.min(100, confidence),
    method: "record-order+image-sha256+price",
    evidence: { orderIndex, trTitle: tr.title, legacyTitle: lg.title, legacySlug: lg.slug, trPrice: tr.price, legacyPrice: lg.price, trOldPrice: tr.old_price, legacyOldPrice: lg.old_price, priceEqual, oldEqual, sharedImages, trImages: tr.images.length, legacyImages: lg.images.length, legacyUrl: lg.source_url },
  };
}

/** Integrity checks over the plan (reported in dry-run and apply). */
export function planChecks(plan: Plan) {
  const dup = <T,>(xs: T[]) => xs.filter((x, i) => xs.indexOf(x) !== i);
  const trSlugs = plan.products.map((p) => p.translation.slug);
  const strings = [...plan.products.flatMap((p) => [p.translation.title, p.translation.descriptionHtml ?? ""]), ...plan.categories.flatMap((c) => c.translations.map((t) => t.name))];
  return {
    products: plan.products.length,
    publishedProducts: plan.products.filter((p) => p.status === "PUBLISHED").length,
    heldForReview: plan.products.filter((p) => p.needsReview).map((p) => `${p.legacyId} ${p.translation.title}`),
    duplicateSourceKeys: dup(plan.products.map((p) => p.sourceKey)),
    duplicateTrSlugs: dup(trSlugs),
    duplicateMediaKeys: dup(plan.mediaAssets.map((m) => m.storageKey)),
    duplicateMediaPaths: dup(plan.mediaAssets.map((m) => m.publicPath)),
    productsWithoutImages: plan.products.filter((p) => p.images.length === 0).map((p) => p.legacyId),
    productsWithoutPrice: plan.products.filter((p) => !p.price).map((p) => p.legacyId),
    invalidDiscounts: plan.products.filter((p) => p.price?.reviewReasons.includes("invalid_discount_compare_at_not_higher")).map((p) => p.legacyId),
    brokenProductImages: plan.products.flatMap((p) => p.missingImages.map((u) => `${p.legacyId}: ${u}`)),
    missingMedia: plan.missingMedia.length,
    mojibake: strings.filter(hasMojibake).length,
    nonNfc: strings.filter((s) => s !== s.normalize("NFC")).length,
    arabicCategoryNames: plan.categories.flatMap((c) => c.translations.filter((t) => t.locale === "ar")).filter((t) => /[؀-ۿ]/.test(t.name)).length,
    matchSuggestions: plan.matches.length,
    matchConfidence: {
      high: plan.matches.filter((m) => m.confidence >= 85).length,
      medium: plan.matches.filter((m) => m.confidence >= 60 && m.confidence < 85).length,
      low: plan.matches.filter((m) => m.confidence < 60).length,
    },
    unmatchedLegacy: plan.unmatchedLegacy,
    legacyRecords: plan.legacyRecords.length,
    redirects: plan.redirects.length,
    mediaAssets: plan.mediaAssets.length,
    productMediaLinks: plan.products.reduce((a, p) => a + p.images.length, 0),
    productCategoryLinks: plan.products.reduce((a, p) => a + p.categories.length, 0),
    variants: plan.products.reduce((a, p) => a + p.variants.length, 0),
  };
}
