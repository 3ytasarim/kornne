import type { FeedItem } from "../feed";
import type { ProductInput, ProductAttributes, MerchantPrice } from "./types";

/**
 * Feed item → Merchant API ProductInput. Input is a FeedItem, which can only be built from a READY product
 * (verified price, real availability) — so the API path inherits every readiness gate. Only catalog fields are
 * mapped: no customer, quote, order or user data can reach this payload (PII isolation by construction).
 */
const AVAIL: Record<FeedItem["availability"], NonNullable<ProductAttributes["availability"]>> = { in_stock: "IN_STOCK", out_of_stock: "OUT_OF_STOCK", preorder: "PREORDER", backorder: "BACKORDER" };
const COND: Record<FeedItem["condition"], NonNullable<ProductAttributes["condition"]>> = { new: "NEW", used: "USED", refurbished: "REFURBISHED" };

/** "1234.50 TRY" → { amountMicros: "1234500000", currencyCode: "TRY" } — exact decimal arithmetic, no floats. */
export function toMicros(price: string): MerchantPrice {
  const m = price.match(/^(\d+)(?:\.(\d{1,6}))? ([A-Z]{3})$/);
  if (!m) throw new Error(`invalid price "${price}"`);
  const micros = BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0") || "0");
  if (micros <= 0n) throw new Error("price must be > 0");
  return { amountMicros: micros.toString(), currencyCode: m[3]! };
}

export function toProductInput(it: FeedItem): ProductInput {
  const attrs: ProductAttributes = {
    title: it.title,
    description: it.description,
    link: it.link,
    imageLink: it.image_link,
    ...(it.additional_image_link.length ? { additionalImageLinks: it.additional_image_link } : {}),
    availability: AVAIL[it.availability],
    condition: COND[it.condition],
    price: toMicros(it.price),
    ...(it.sale_price ? { salePrice: toMicros(it.sale_price) } : {}),
    ...(it.shipping ? { shipping: [{ country: it.shipping.country, price: toMicros(it.shipping.price) }] } : {}),
    ...(it.brand ? { brand: it.brand } : {}),
    ...(it.gtin ? { gtins: [it.gtin] } : {}),
    ...(it.mpn ? { mpn: it.mpn } : {}),
    ...(it.identifier_exists === "no" ? { identifierExists: false } : {}),
    ...(it.google_product_category ? { googleProductCategory: it.google_product_category } : {}),
    ...(it.product_type ? { productTypes: [it.product_type] } : {}),
  };
  return { offerId: it.id, contentLanguage: it.content_language, feedLabel: it.feed_label, productAttributes: attrs };
}

/** Stable content hash → idempotency: an unchanged item is never re-sent. */
export async function inputHash(input: ProductInput): Promise<string> {
  const { createHash } = await import("node:crypto");
  const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
  return createHash("sha256").update(JSON.stringify(canon(input))).digest("hex");
}

/** productInputs/{name}: "{contentLanguage}~{feedLabel}~{offerId}" (URL-safe base64 is also accepted by the API). */
export function productInputName(accountId: string, ref: { offerId: string; contentLanguage: string; feedLabel: string }): string {
  return `accounts/${accountId}/productInputs/${encodeURIComponent(`${ref.contentLanguage}~${ref.feedLabel}~${ref.offerId}`)}`;
}
