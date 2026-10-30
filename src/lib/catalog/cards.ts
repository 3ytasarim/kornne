import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { discountPercent, formatMoney } from "@/lib/money";
import { isBestseller } from "@/config/badges";
import type { CatalogProduct } from "./types";

/** Serializable product-card data (no bigint) — shared by server-rendered grids and the client listing controls. */
export type CardData = {
  id: string;
  /** true when the card can add straight to the cart (verified price, no option to choose) */
  quickAdd: boolean;
  /** legacy "En Çok Satan" sticker (src/config/badges.ts) */
  bestseller: boolean;
  href: string;
  /** set when the card links to the Turkish page because the current locale has no translation */
  hrefLang: Locale | null;
  title: string;
  /** title language when it differs from the page language */
  titleLang: Locale | null;
  image: { src: string; width: number | null; height: number | null } | null;
  /** formatted customer price — only for VERIFIED prices; otherwise null and the card shows "price on request" */
  price: string | null;
  compareAt: string | null;
  discountPct: number | null;
  categoryKeys: string[];
  sortOrder: number;
  /** folded search text for the client-side list filter */
  searchText: string;
};

export function productHref(p: Pick<CatalogProduct, "pageLocale" | "slug">): string {
  return localizePath(p.pageLocale, `/urun/${p.slug}`);
}

const fold = (s: string) => s.toLocaleLowerCase("tr").normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i");

export function toCard(p: CatalogProduct, locale: Locale): CardData {
  const fallback = p.pageLocale !== locale;
  const pct = p.priceVerified ? discountPercent(p.priceMinor, p.compareAtMinor) : null;
  return {
    id: p.sourceId,
    bestseller: isBestseller(p),
    quickAdd: p.priceVerified && p.priceMinor !== null && p.vatIncluded !== null && !p.variants.some((v) => v.options.length),
    href: productHref(p),
    hrefLang: fallback ? p.pageLocale : null,
    title: p.title,
    titleLang: fallback ? p.pageLocale : null,
    image: p.images[0] ? { src: p.images[0].src, width: p.images[0].width, height: p.images[0].height } : null,
    price: p.priceVerified && p.priceMinor !== null ? formatMoney(p.priceMinor, p.currency, locale) : null,
    compareAt: pct !== null && p.compareAtMinor !== null ? formatMoney(p.compareAtMinor, p.currency, locale) : null,
    discountPct: pct,
    categoryKeys: p.categoryKeys,
    sortOrder: p.sortOrder,
    searchText: fold(`${p.title} ${p.descriptionText.slice(0, 400)}`),
  };
}

export { fold as foldForSearch };
