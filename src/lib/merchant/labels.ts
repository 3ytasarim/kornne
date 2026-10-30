import type { Evaluated } from "./facts";
import type { Reason } from "./readiness";

/** Turkish labels + fix locations for readiness reason codes (admin screens and exports). */
export const REASON_LABEL: Record<string, string> = {
  TARGET_UNSET: "Hedef ülke/dil/feedLabel teyitsiz", SITE_NOT_LIVE: "Site canlı değil", CHECKOUT_CLOSED: "Ödeme kapalı", SHIPPING_UNVERIFIED: "Kargo kuralı teyitsiz", RETURNS_UNVERIFIED: "İade politikası onaysız", BUSINESS_IDENTITY_UNVERIFIED: "Ticari unvan teyitsiz",
  PRODUCT_NOT_PUBLIC: "Ürün vitrinde değil", SALE_MODE_QUOTE_ONLY: "Yalnız teklif", LANGUAGE_NOT_PUBLISHED: "Hedef dilde çeviri yok", LANDING_NOT_INDEXABLE: "Açılış sayfası noindex", TITLE_MISSING: "Başlık yok", TITLE_TOO_LONG: "Başlık > 150", DESCRIPTION_SHORT: "Kısa açıklama", DESCRIPTION_POLICY: "Açıklama politika ihlali",
  PRICE_MISSING: "Fiyat yok", PRICE_UNVERIFIED: "Fiyat onaysız", PRICE_ZERO: "Fiyat 0", CURRENCY_MISMATCH: "Para birimi", VAT_UNKNOWN: "KDV bilinmiyor", SALE_PRICE_INVALID: "Geçersiz indirim", PRICE_NOT_ON_PAGE: "Sayfa fiyatı farklı",
  AVAILABILITY_UNKNOWN: "Stok bilinmiyor", IDENTIFIER_MISSING: "GTIN/MPN yok", BRAND_UNVERIFIED: "Marka teyitsiz", IMAGE_MISSING: "Görsel yok", IMAGE_TOO_SMALL: "Görsel < 100 px", IMAGE_BELOW_2027: "Görsel < 500 px (2027)", IMAGE_FORMAT: "Görsel biçimi", IMAGE_REVIEW: "Görsel manuel kontrol",
  GOOGLE_CATEGORY_MISSING: "Google kategorisi yok", OFFER_ID_UNMAPPED: "Eski item_id eşleşmesi yok",
};

/** Where each reason is fixed (deep links into the admin). */
export function fixHref(r: Reason, e: Pick<Evaluated, "id" | "ref">): string {
  switch (r.area) {
    case "price": return `/admin/pricing?q=${encodeURIComponent(e.ref)}`;
    case "stock": return `/admin/inventory`;
    case "media": return r.code === "IMAGE_REVIEW" ? `/admin/seo/gorseller?q=${encodeURIComponent(e.ref)}` : `/admin/products/${e.id}?tab=gorseller`;
    case "translation": return `/admin/products/${e.id}?tab=diller`;
    case "content": return `/admin/products/${e.id}`;
    case "settings": return r.code === "RETURNS_UNVERIFIED" ? "/admin/content" : "/admin/settings";
    case "site": return "/admin/merchant/baglanti";
    default: return r.code === "OFFER_ID_UNMAPPED" ? "/admin/merchant/eslesme" : `/admin/products/${e.id}?tab=teknik`;
  }
}

/** Reasons that block EVERY product (environment / business decisions), shown separately from product reasons. */
export const GLOBAL_REASONS = new Set(["TARGET_UNSET", "SITE_NOT_LIVE", "CHECKOUT_CLOSED", "SHIPPING_UNVERIFIED", "RETURNS_UNVERIFIED", "BUSINESS_IDENTITY_UNVERIFIED"]);
