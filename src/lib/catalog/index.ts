import "server-only";
import { prisma } from "@/lib/db";
import { convertMinor, displayCurrency } from "@/lib/fx/convert";
import { getRates } from "@/lib/fx/rates";
import type { Locale } from "@/lib/i18n/config";
import { prismaRepository } from "./prisma-repository";
import type { CatalogProduct, CatalogRepository } from "./types";

/**
 * Display currency per language (client decision 11.11.2026): Turkish pages show TRY, every other language USD.
 * Prices are stored in the currency they were entered in (USD for new prices, TRY for the imported legacy ones) and
 * converted here with the current TCMB ForexSelling rate. Without a rate a converted price is hidden ("price on
 * request") rather than shown wrong.
 */
async function inDisplayCurrency(locale: Locale, products: CatalogProduct[]): Promise<CatalogProduct[]> {
  const target = displayCurrency(locale);
  if (products.every((p) => p.priceMinor === null || p.currency === target)) return products;
  const rates = await getRates(prisma);
  return products.map((p) => {
    if (p.priceMinor === null || p.currency === target) return p;
    const price = convertMinor(p.priceMinor, p.currency, target, rates);
    if (price === null) return { ...p, priceMinor: null, compareAtMinor: null, priceVerified: false };
    const compareAt = p.compareAtMinor === null ? null : convertMinor(p.compareAtMinor, p.currency, target, rates);
    return { ...p, priceMinor: price, compareAtMinor: compareAt, currency: target };
  });
}

/** Single entry point for storefront reads — Sprint 3: Neon via Prisma (snapshot repository kept for tests/audit). */
export const catalog: CatalogRepository = {
  listCategories: (locale) => prismaRepository.listCategories(locale),
  async getCategory(locale, slug) {
    const r = await prismaRepository.getCategory(locale, slug);
    return r ? { ...r, products: await inDisplayCurrency(locale, r.products) } : null;
  },
  async getProduct(locale, slug) {
    const p = await prismaRepository.getProduct(locale, slug);
    return p ? ((await inDisplayCurrency(locale, [p]))[0] ?? null) : null;
  },
  async listProducts(locale) {
    return inDisplayCurrency(locale, await prismaRepository.listProducts(locale));
  },
  async search(locale, query) {
    return inDisplayCurrency(locale, await prismaRepository.search(locale, query));
  },
};

/**
 * Launch gate for search indexing of catalog pages (client sign-off on catalog data). Default FALSE → catalog pages
 * stay noindex and the sitemap stays empty. Since Sprint 8 it is an explicit env flag (CATALOG_DATA_VERIFIED=true) so
 * the PRODUCTION-LIKE behaviour can be verified offline (localhost, isolated DB) without editing code. It never
 * enables Offer markup, prices or a Merchant feed — those have their own per-product gates.
 */
export const CATALOG_DATA_VERIFIED = process.env.CATALOG_DATA_VERIFIED === "true";

/** ISR window for catalog pages (seconds). Admin approvals also call revalidatePath. */
export const CATALOG_REVALIDATE = 300;

export { invalidateCatalog } from "./prisma-repository";
export type * from "./types";
