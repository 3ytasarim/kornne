import type { PrismaClient } from "@prisma/client";
import { commerceGate, type CommerceEnv } from "@/lib/commerce/gate";
import { ENABLED_LOCALES, isEnabledLocale, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { convertMinor, type Rates } from "@/lib/fx/convert";
import { getRates } from "@/lib/fx/rates";
import { getSiteUrl } from "@/lib/seo/site";
import { evaluateReadiness, type MerchantContext, type ProductFacts, type Reason } from "./readiness";

/**
 * Collects REAL facts for the readiness engine and the feed (read-only queries). Merchant target settings count only
 * when a super admin marked them VERIFIED; until then the engine reports TARGET_UNSET.
 */
const PAGE_STATUSES = new Set(["LEGACY_SOURCE", "APPROVED"]);
const SUSPECT = /(whatsapp|img[-_]\d{6,}|screenshot|ekran|logo|banner)/i;
export const RETURNS_PAGE_KEY = "iade-ve-geri-odeme-politikalari";

export type FeedSource = ProductFacts & { link: string | null; imageLink: string | null; additionalImageLinks: string[]; descriptionHtml: string; condition: "new" | "refurbished" | "used"; brandName: string | null; productType: string | null; offerId: string; mappedOfferId: string | null };
export type Evaluated = FeedSource & { status: "READY" | "BLOCKED"; reasons: Reason[] };

export async function loadMerchantContext(db: PrismaClient, env: CommerceEnv = process.env, now = new Date()): Promise<MerchantContext> {
  const [settings, returns] = await Promise.all([
    db.siteSetting.findMany({ where: { key: { in: ["merchant.targetCountry", "merchant.contentLanguage", "merchant.feedLabel", "commerce.shippingPolicy", "company.legalName"] } }, select: { key: true, value: true, status: true } }),
    db.page.findUnique({ where: { key: RETURNS_PAGE_KEY }, select: { legalApprovedAt: true } }),
  ]);
  const verified = (k: string) => {
    const s = settings.find((x) => x.key === k && x.status === "VERIFIED");
    const v = s ? String(s.value ?? "").trim() : "";
    return v || null;
  };
  const lang = verified("merchant.contentLanguage")?.toLowerCase() ?? null;
  const country = verified("merchant.targetCountry")?.toUpperCase() ?? null;
  return {
    targetCountry: country,
    contentLanguage: lang,
    feedLabel: verified("merchant.feedLabel"),
    currency: targetCurrency(country),
    siteIndexable: env.SITE_INDEXABLE === "true",
    catalogVerified: env.CATALOG_DATA_VERIFIED === "true",
    targetLocaleIsSeo: !!lang && isEnabledLocale(lang) && (env.SEO_LOCALES?.trim() ? env.SEO_LOCALES.split(",").map((x) => x.trim()) : [...ENABLED_LOCALES]).includes(lang as Locale),
    checkoutOpen: commerceGate(env).enabled,
    shippingVerified: !!verified("commerce.shippingPolicy"),
    returnsVerified: !!returns?.legalApprovedAt,
    businessVerified: !!verified("company.legalName"),
    now,
  };
}

/**
 * Feed currency follows the storefront rule (client 11.11.2026): Turkey is sold in TRY, every other country in USD
 * (target US since 12.11.2026). Prices stored in another currency are converted exactly like the storefront does.
 */
export const targetCurrency = (country: string | null): "TRY" | "USD" => (!country || country === "TR" ? "TRY" : "USD");

type PriceRow = { amountMinor: bigint; currency: string; status: string; vatIncluded: boolean | null; compareAtMinor: bigint | null };
/** Price in the feed currency, converted at the same TCMB rate the landing page uses; null rate → left as is (CURRENCY_MISMATCH). */
function inCurrency(p: PriceRow, to: string, rates: Pick<Rates, "USD" | "EUR"> | null): ProductFacts["price"] {
  if (p.currency === to) return { ...p, converted: false };
  const amount = convertMinor(p.amountMinor, p.currency, to, rates);
  if (amount === null) return { ...p, converted: false };
  const compareAt = p.compareAtMinor === null ? null : convertMinor(p.compareAtMinor, p.currency, to, rates);
  return { ...p, amountMinor: amount, compareAtMinor: compareAt, currency: to, converted: true };
}

export async function loadFeedSources(db: PrismaClient, ctx: Pick<MerchantContext, "contentLanguage" | "feedLabel"> & { currency?: string }, now = new Date(), rates: Pick<Rates, "USD" | "EUR"> | null = null): Promise<FeedSource[]> {
  const currency = ctx.currency ?? "TRY";
  const locale = ctx.contentLanguage && isEnabledLocale(ctx.contentLanguage) ? ctx.contentLanguage : "tr";
  const site = getSiteUrl();
  const products = await db.product.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { sourceKey: "asc" }],
    select: {
      id: true, sourceKey: true, status: true, needsReview: true, saleMode: true, condition: true, gtin: true, mpn: true, identifierExists: true, googleProductCategory: true, productType: true,
      brand: { select: { name: true, status: true } },
      translations: { select: { locale: true, status: true, title: true, slug: true, descriptionHtml: true } },
      prices: { where: { variantId: null }, orderBy: { validFrom: "desc" }, select: { amountMinor: true, currency: true, status: true, vatIncluded: true, compareAtMinor: true, validFrom: true, validTo: true } },
      inventory: { where: { variantId: null }, select: { availability: true } },
      media: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }], select: { media: { select: { publicPath: true, width: true, height: true, mime: true } } } },
      merchantItems: { where: { variantId: null }, select: { offerId: true, contentLanguage: true, feedLabel: true } },
    },
  });
  const src = (p: string) => `${site}/upload/${p.replace(/^\/?upload\//, "").split("/").map(encodeURIComponent).join("/")}`;
  return products.map((p) => {
    const t = p.translations.find((x) => x.locale === locale);
    const published = !!t && PAGE_STATUSES.has(t.status);
    // the price the storefront renders: newest VERIFIED and currently valid
    const live = p.prices.find((x) => x.status === "VERIFIED" && x.validFrom <= now && (!x.validTo || x.validTo > now)) ?? null;
    // the price a feed item would carry: the live one, else the newest record (to report WHY it is not usable)
    const raw = live ?? p.prices[0] ?? null;
    const price = raw ? inCurrency(raw, currency, rates) : null;
    const pagePrice = live ? inCurrency(live, currency, rates) : null;
    const main = p.media[0]?.media ?? null;
    const ref = (p.sourceKey ?? p.id).split(":").pop()!;
    const mapped = p.merchantItems.find((m) => m.contentLanguage === locale && (!ctx.feedLabel || m.feedLabel === ctx.feedLabel)) ?? null;
    return {
      id: p.id,
      ref,
      status: p.status,
      needsReview: p.needsReview,
      saleMode: p.saleMode,
      title: t?.title ?? null,
      descriptionText: (t?.descriptionHtml ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
      descriptionHtml: t?.descriptionHtml ?? "",
      targetTranslationPublished: published,
      price: price ? { amountMinor: price.amountMinor, currency: price.currency, status: price.status, vatIncluded: price.vatIncluded, compareAtMinor: price.compareAtMinor, converted: price.converted } : null,
      pagePriceMinor: pagePrice?.amountMinor ?? null,
      availability: p.inventory[0]?.availability ?? null,
      gtin: p.gtin,
      mpn: p.mpn,
      identifierExists: p.identifierExists,
      brandVerified: p.brand?.status === "VERIFIED",
      brandName: p.brand?.status === "VERIFIED" ? p.brand.name : null,
      googleProductCategory: p.googleProductCategory,
      productType: p.productType,
      mainImage: main ? { width: main.width, height: main.height, mime: main.mime, suspect: SUSPECT.test(decodeURIComponent(main.publicPath)) } : null,
      offerIdMapped: !!mapped,
      mappedOfferId: mapped?.offerId ?? null,
      // a NEW offerId is the stable legacy reference; an existing Merchant item id always wins (no duplicates)
      offerId: mapped?.offerId ?? `kornne-${ref}`,
      link: published && t ? `${site}${localizePath(locale, `/urun/${t.slug}`)}` : null,
      imageLink: main ? src(main.publicPath) : null,
      additionalImageLinks: p.media.slice(1, 11).map((m) => src(m.media.publicPath)),
      condition: p.condition === "REFURBISHED" ? "refurbished" : p.condition === "USED" ? "used" : "new",
    };
  });
}

export async function evaluateCatalog(db: PrismaClient, env: CommerceEnv = process.env, now = new Date(), rates?: Pick<Rates, "USD" | "EUR"> | null) {
  const ctx = await loadMerchantContext(db, env, now);
  // rates are only needed (and fetched) when some price is stored in another currency than the feed's
  const needsFx = rates === undefined && (await db.price.count({ where: { variantId: null, currency: { not: ctx.currency } } })) > 0;
  const sources = await loadFeedSources(db, ctx, now, rates ?? (needsFx ? await getRates(db) : null));
  // only storefront-public products are feed candidates; held/draft ones are reported separately
  const evaluated: Evaluated[] = sources.map((s) => ({ ...s, ...evaluateReadiness(s, ctx) }));
  const candidates = evaluated.filter((e) => e.status !== "BLOCKED" || !e.reasons.some((r) => r.code === "PRODUCT_NOT_PUBLIC"));
  const held = evaluated.filter((e) => e.reasons.some((r) => r.code === "PRODUCT_NOT_PUBLIC"));
  const byReason: Record<string, number> = {};
  for (const e of candidates) for (const r of e.reasons) if (r.severity === "blocking") byReason[r.code] = (byReason[r.code] ?? 0) + 1;
  return { ctx, candidates, held, ready: candidates.filter((e) => e.status === "READY"), byReason };
}
