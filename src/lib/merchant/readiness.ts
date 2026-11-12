import { MERCHANT_MIN_2027, MERCHANT_MIN_NOW } from "@/lib/seo/image-audit";

/**
 * Google Merchant readiness engine (Sprint 9). Pure: facts in → READY / BLOCKED with reason codes out.
 * A product is READY only when EVERY blocking gate passes with REAL, verified data. Nothing is ever defaulted:
 * no "0 TL", no "in stock" guess, no invented brand / GTIN / MPN, no out_of_stock placeholder.
 *
 * Gates follow the Google Merchant product data specification (id, title, description, link, image_link,
 * availability, price, brand, gtin/mpn/identifier_exists, condition, shipping, returns) plus KORNNE's own rules
 * (verified price page = feed, published translation, indexable landing page, business identity).
 */
export type Severity = "blocking" | "warning";
export type ReasonCode =
  | "PRODUCT_NOT_PUBLIC" | "SALE_MODE_QUOTE_ONLY" | "CHECKOUT_CLOSED" | "LANGUAGE_NOT_PUBLISHED" | "LANDING_NOT_INDEXABLE" | "SITE_NOT_LIVE"
  | "PRICE_MISSING" | "PRICE_UNVERIFIED" | "PRICE_ZERO" | "CURRENCY_MISMATCH" | "VAT_UNKNOWN" | "SALE_PRICE_INVALID" | "PRICE_NOT_ON_PAGE" | "PRICE_FX_CONVERTED"
  | "AVAILABILITY_UNKNOWN" | "IDENTIFIER_MISSING" | "BRAND_UNVERIFIED"
  | "IMAGE_MISSING" | "IMAGE_TOO_SMALL" | "IMAGE_BELOW_2027" | "IMAGE_FORMAT" | "IMAGE_REVIEW"
  | "TITLE_MISSING" | "TITLE_TOO_LONG" | "DESCRIPTION_SHORT" | "DESCRIPTION_POLICY"
  | "TARGET_UNSET" | "SHIPPING_UNVERIFIED" | "RETURNS_UNVERIFIED" | "BUSINESS_IDENTITY_UNVERIFIED"
  | "GOOGLE_CATEGORY_MISSING" | "OFFER_ID_UNMAPPED";
export type Reason = { code: ReasonCode; severity: Severity; message: string; fix: string; area: "product" | "price" | "stock" | "media" | "content" | "translation" | "settings" | "site" };

export type ProductFacts = {
  id: string;
  ref: string;
  status: string;
  needsReview: boolean;
  saleMode: "CART" | "QUOTE_ONLY" | "CART_AND_QUOTE";
  title: string | null;
  descriptionText: string;
  /** translation of the target language exists and is LEGACY_SOURCE / APPROVED */
  targetTranslationPublished: boolean;
  /** in the feed currency; converted = stored in another currency and converted at the TCMB rate */
  price: { amountMinor: bigint; currency: string; status: string; vatIncluded: boolean | null; compareAtMinor: bigint | null; converted?: boolean } | null;
  /** the live (VERIFIED, currently valid) price, as the storefront renders it */
  pagePriceMinor: bigint | null;
  availability: string | null;
  gtin: string | null;
  mpn: string | null;
  identifierExists: boolean | null;
  brandVerified: boolean;
  googleProductCategory: string | null;
  mainImage: { width: number | null; height: number | null; mime: string; suspect: boolean } | null;
  offerIdMapped: boolean;
};

export type MerchantContext = {
  targetCountry: string | null;
  contentLanguage: string | null;
  feedLabel: string | null;
  currency: string;
  siteIndexable: boolean;
  catalogVerified: boolean;
  targetLocaleIsSeo: boolean;
  checkoutOpen: boolean;
  shippingVerified: boolean;
  returnsVerified: boolean;
  businessVerified: boolean;
  /** evaluate the 2027 image threshold as blocking (default: from 31 Jan 2027) */
  now?: Date;
};

const R = (code: ReasonCode, severity: Severity, area: Reason["area"], message: string, fix: string): Reason => ({ code, severity, area, message, fix });
const GTIN_RE = /^(\d{8}|\d{12}|\d{13}|\d{14})$/;
const POLICY_RE = /(https?:\/\/|www\.|\+?90\s?\d{3}|0\s?5\d{2}\s?\d{3}|whatsapp|ücretsiz kargo|indirim(?:li)?!|kampanya|en ucuz)/i;

/** GS1 mod-10 check digit — a GTIN that fails it is rejected (never "fixed"). */
export function validGtin(g: string): boolean {
  if (!GTIN_RE.test(g)) return false;
  const digits = g.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((a, d, i) => a + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function evaluateReadiness(p: ProductFacts, ctx: MerchantContext): { status: "READY" | "BLOCKED"; reasons: Reason[] } {
  const out: Reason[] = [];
  const now = ctx.now ?? new Date();
  // environment / business
  if (!ctx.targetCountry || !ctx.contentLanguage || !ctx.feedLabel) out.push(R("TARGET_UNSET", "blocking", "settings", "Hedef ülke / içerik dili / feedLabel teyit edilmedi", "Admin › Ayarlar › Google Merchant hedefi (mevcut hesaptan salt-okunur teyit)"));
  if (!ctx.siteIndexable || !ctx.catalogVerified) out.push(R("SITE_NOT_LIVE", "blocking", "site", "Açılış sayfası canlı/indekslenebilir değil (yayına geçiş yapılmadı)", "Cutover sonrası; önce staging'de doğrulama"));
  if (!ctx.checkoutOpen) out.push(R("CHECKOUT_CLOSED", "blocking", "site", "Ödeme kapalı: ürün sitede satın alınamıyor (teklif modeli)", "Ödeme kapısı ön koşulları (ENABLE_PAID_CHECKOUT + sağlayıcı) — müşteri kararı"));
  if (!ctx.shippingVerified) out.push(R("SHIPPING_UNVERIFIED", "blocking", "settings", "Kargo/nakliye kuralları doğrulanmadı", "Admin › Ayarlar › Kargo kuralları + müşteri teyidi; Merchant'ta kargo ayarı"));
  if (!ctx.returnsVerified) out.push(R("RETURNS_UNVERIFIED", "blocking", "settings", "İade politikası hukuken onaylanmadı", "Admin › İçerik › İade politikası — hukuki onay"));
  if (!ctx.businessVerified) out.push(R("BUSINESS_IDENTITY_UNVERIFIED", "blocking", "settings", "Ticari unvan doğrulanmadı (kaynak sitede 3 farklı satıcı kimliği)", "Admin › Ayarlar › Firma kimliği — süper yönetici doğrulaması"));
  // product
  if (p.status !== "PUBLISHED" || p.needsReview) out.push(R("PRODUCT_NOT_PUBLIC", "blocking", "product", p.needsReview ? "Ürün incelemede (vitrinde yok)" : `Ürün durumu ${p.status}`, "Ürün kararı (ör. #208 müşteri onayı)"));
  if (p.saleMode === "QUOTE_ONLY") out.push(R("SALE_MODE_QUOTE_ONLY", "blocking", "product", "Yalnız teklif ile satılıyor — fiyatlı ürün ilanı olamaz", "Satış modu müşteri kararı"));
  if (!p.targetTranslationPublished) out.push(R("LANGUAGE_NOT_PUBLISHED", "blocking", "translation", `Hedef dilde (${ctx.contentLanguage ?? "?"}) yayımlanmış çeviri yok`, "Admin › Çeviriler"));
  else if (!ctx.targetLocaleIsSeo) out.push(R("LANDING_NOT_INDEXABLE", "blocking", "site", "Hedef dil SEO dillerinde değil (açılış sayfası noindex)", "SEO_LOCALES ayarı (çeviri onayından sonra)"));
  if (!p.title?.trim()) out.push(R("TITLE_MISSING", "blocking", "content", "Başlık yok", "Ürün içeriği"));
  else if (p.title.length > 150) out.push(R("TITLE_TOO_LONG", "blocking", "content", `Başlık ${p.title.length} karakter (> 150)`, "Ürün başlığı"));
  const desc = p.descriptionText.trim();
  if (desc.length < 150) out.push(R("DESCRIPTION_SHORT", "warning", "content", `Açıklama ${desc.length} karakter`, "Ürün açıklaması (bilgi müşteriden)"));
  if (POLICY_RE.test(desc)) out.push(R("DESCRIPTION_POLICY", "blocking", "content", "Açıklamada telefon/URL/promosyon ifadesi var (Merchant politikası)", "Açıklamadan iletişim/promosyon metnini kaldırın"));
  // price
  if (!p.price) out.push(R("PRICE_MISSING", "blocking", "price", "Fiyat kaydı yok", "Admin › Fiyatlar"));
  else {
    if (p.price.status !== "VERIFIED") out.push(R("PRICE_UNVERIFIED", "blocking", "price", "Fiyat onaylı değil (eski siteden, KDV/para birimi teyitsiz)", "Admin › Fiyatlar — dört göz onayı (öneren ≠ onaylayan)"));
    if (p.price.amountMinor <= 0n) out.push(R("PRICE_ZERO", "blocking", "price", "Fiyat 0 veya negatif", "Gerçek fiyat"));
    if (p.price.currency !== ctx.currency) out.push(R("CURRENCY_MISMATCH", "blocking", "price", `Para birimi ${p.price.currency} ≠ ${ctx.currency}`, "Hedef ülke para birimi"));
    if (p.price.converted) out.push(R("PRICE_FX_CONVERTED", "warning", "price", `Fiyat ${ctx.currency} değil, TCMB kuruyla çevriliyor — kur her gün değişir, feed ile sayfa fiyatı arada ayrışabilir`, `Bu ürüne doğrudan ${ctx.currency} fiyat girin`));
    // VAT applies to Turkish sales only (client 11.11.2026); abroad the listed price is the whole amount
    if (ctx.targetCountry === "TR" && p.price.vatIncluded !== true) out.push(R("VAT_UNKNOWN", "blocking", "price", p.price.vatIncluded === false ? "Fiyat KDV hariç (TR'de tüketici fiyatı KDV dahil olmalı)" : "KDV durumu bilinmiyor", "Fiyat kaydında KDV dahil + oran"));
    if (p.price.compareAtMinor !== null && p.price.compareAtMinor <= p.price.amountMinor) out.push(R("SALE_PRICE_INVALID", "blocking", "price", "Eski fiyat ≤ satış fiyatı (geçersiz indirim)", "Eski fiyatı kaldırın veya düzeltin"));
    if (p.price.status === "VERIFIED" && p.pagePriceMinor !== p.price.amountMinor) out.push(R("PRICE_NOT_ON_PAGE", "blocking", "price", "Açılış sayfasındaki fiyat feed fiyatıyla aynı değil", "Önbellek / geçerlilik tarihleri"));
  }
  // stock
  if (!p.availability || p.availability === "UNKNOWN") out.push(R("AVAILABILITY_UNKNOWN", "blocking", "stock", "Stok / temin durumu bilinmiyor", "Admin › Stok — gerçek durum (tahmin yok)"));
  // identifiers
  const gtinOk = !!p.gtin && validGtin(p.gtin);
  if (!gtinOk && !(p.mpn && p.brandVerified) && p.identifierExists !== false) out.push(R("IDENTIFIER_MISSING", "blocking", "product", p.gtin && !gtinOk ? "GTIN geçersiz (kontrol hanesi)" : "GTIN yok; MPN+marka yok; identifier_exists=no da işaretlenmedi", "Üretici kodu varsa MPN, yoksa müşteri teyidiyle identifier_exists=no (barkod üretilmez)"));
  if (!p.brandVerified) out.push(R("BRAND_UNVERIFIED", "blocking", "product", "Marka doğrulanmadı", "Ürün markası (KORNNE kendi üretimi mi?) — müşteri teyidi"));
  if (!p.googleProductCategory) out.push(R("GOOGLE_CATEGORY_MISSING", "warning", "product", "Google ürün kategorisi yok (Google otomatik atar)", "İsteğe bağlı: taksonomi kimliği"));
  if (!p.offerIdMapped) out.push(R("OFFER_ID_UNMAPPED", "warning", "product", "Mevcut Merchant hesabındaki item_id ile eşleşme yok", "Admin › Merchant › Eski item_id eşleme (yinelenen ürün riski)"));
  // image
  if (!p.mainImage) out.push(R("IMAGE_MISSING", "blocking", "media", "Ana görsel yok", "Ürün görselleri"));
  else {
    const short = p.mainImage.width && p.mainImage.height ? Math.min(p.mainImage.width, p.mainImage.height) : 0;
    const after2027 = now >= new Date("2027-01-31T00:00:00Z");
    if (short < MERCHANT_MIN_NOW) out.push(R("IMAGE_TOO_SMALL", "blocking", "media", `Ana görsel ${p.mainImage.width}×${p.mainImage.height} (< 100 px)`, "Müşteriden yüksek çözünürlüklü orijinal"));
    else if (short < MERCHANT_MIN_2027) out.push(R("IMAGE_BELOW_2027", after2027 ? "blocking" : "warning", "media", `Ana görsel ${p.mainImage.width}×${p.mainImage.height} — 31.01.2027'den itibaren 500×500 altı`, "Müşteriden ≥1500 px orijinal"));
    if (!["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/tiff"].includes(p.mainImage.mime)) out.push(R("IMAGE_FORMAT", "blocking", "media", `Biçim ${p.mainImage.mime}`, "JPEG/PNG türev"));
    if (p.mainImage.suspect) out.push(R("IMAGE_REVIEW", "warning", "media", "Ana görsel WhatsApp/ekran görüntüsü olabilir — filigran/yazı manuel kontrol", "Admin › SEO › Görsel SEO"));
  }
  return { status: out.some((r) => r.severity === "blocking") ? "BLOCKED" : "READY", reasons: out };
}
