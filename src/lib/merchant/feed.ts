import { toDecimalString } from "@/lib/money";
import type { Evaluated } from "./facts";
import type { MerchantContext } from "./readiness";

/**
 * Merchant feed (Sprint 9) — built ONLY from READY items. A BLOCKED item can never reach the output: the builder
 * re-checks the status itself (defence in depth) and refuses any item without a verified price / real availability.
 * Formats: RSS 2.0 + g: namespace (XML), TSV and CSV with the Merchant attribute names. Preview only: nothing is
 * uploaded or fetched by Google from here.
 */
export type FeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string[];
  availability: "in_stock" | "out_of_stock" | "preorder" | "backorder";
  price: string;
  sale_price?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  identifier_exists?: "no";
  condition: "new" | "refurbished" | "used";
  google_product_category?: string;
  product_type?: string;
  content_language: string;
  target_country: string;
  feed_label: string;
};

export const FEED_COLUMNS = ["id", "title", "description", "link", "image_link", "additional_image_link", "availability", "price", "sale_price", "brand", "gtin", "mpn", "identifier_exists", "condition", "google_product_category", "product_type", "content_language", "target_country", "feed_label"] as const;

const AVAIL: Record<string, FeedItem["availability"] | undefined> = { IN_STOCK: "in_stock", OUT_OF_STOCK: "out_of_stock", PREORDER: "preorder", BACKORDER: "backorder", MADE_TO_ORDER: "backorder" };
const money = (minor: bigint, cur: string) => `${toDecimalString(minor)} ${cur}`;

export class FeedRefusal extends Error {}

export function toFeedItem(e: Evaluated, ctx: MerchantContext): FeedItem {
  // defence in depth — the readiness engine already blocks these, the builder refuses them again
  if (e.status !== "READY") throw new FeedRefusal(`${e.offerId}: not READY`);
  if (!e.price || e.price.status !== "VERIFIED" || e.price.amountMinor <= 0n) throw new FeedRefusal(`${e.offerId}: price not verified`);
  const availability = e.availability ? AVAIL[e.availability] : undefined;
  if (!availability) throw new FeedRefusal(`${e.offerId}: availability unknown`);
  if (!e.link || !e.imageLink || !e.title || !ctx.contentLanguage || !ctx.targetCountry || !ctx.feedLabel) throw new FeedRefusal(`${e.offerId}: incomplete`);
  const sale = e.price.compareAtMinor && e.price.compareAtMinor > e.price.amountMinor;
  return {
    id: e.offerId,
    title: e.title.slice(0, 150),
    description: e.descriptionText.slice(0, 5000),
    link: e.link,
    image_link: e.imageLink,
    additional_image_link: e.additionalImageLinks,
    availability,
    // with a valid compare-at price: price = regular (compare-at), sale_price = the verified selling price
    price: money(sale ? e.price.compareAtMinor! : e.price.amountMinor, e.price.currency),
    ...(sale ? { sale_price: money(e.price.amountMinor, e.price.currency) } : {}),
    ...(e.brandName ? { brand: e.brandName } : {}),
    ...(e.gtin ? { gtin: e.gtin } : {}),
    ...(e.mpn ? { mpn: e.mpn } : {}),
    ...(e.identifierExists === false && !e.gtin && !e.mpn ? { identifier_exists: "no" as const } : {}),
    condition: e.condition,
    ...(e.googleProductCategory ? { google_product_category: e.googleProductCategory } : {}),
    ...(e.productType ? { product_type: e.productType } : {}),
    content_language: ctx.contentLanguage,
    target_country: ctx.targetCountry,
    feed_label: ctx.feedLabel,
  };
}

export function buildFeed(items: Evaluated[], ctx: MerchantContext): { items: FeedItem[]; excluded: { offerId: string; ref: string; title: string | null; reasons: string[] }[] } {
  const out: FeedItem[] = [];
  const excluded: { offerId: string; ref: string; title: string | null; reasons: string[] }[] = [];
  for (const e of items) {
    try {
      out.push(toFeedItem(e, ctx));
    } catch (err) {
      if (!(err instanceof FeedRefusal)) throw err;
      excluded.push({ offerId: e.offerId, ref: e.ref, title: e.title, reasons: e.reasons.filter((r) => r.severity === "blocking").map((r) => r.code) });
    }
  }
  return { items: out, excluded };
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export function feedXml(items: FeedItem[], meta: { title: string; link: string; generatedAt: Date }): string {
  const body = items
    .map((it) => {
      const fields = FEED_COLUMNS.filter((c) => !["content_language", "target_country", "feed_label"].includes(c)).flatMap((c) => {
        const v = it[c as keyof FeedItem];
        if (v === undefined || (Array.isArray(v) && !v.length)) return [];
        const tag = c === "title" || c === "description" || c === "link" ? c : `g:${c}`;
        return (Array.isArray(v) ? v : [v]).map((x) => `      <${tag}>${xmlEsc(String(x))}</${tag}>`);
      });
      return `    <item>\n${fields.join("\n")}\n    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${xmlEsc(meta.title)}</title>\n    <link>${xmlEsc(meta.link)}</link>\n    <description>KORNNE ürün feed önizlemesi — ${meta.generatedAt.toISOString()} — GÖNDERİLMEDİ</description>\n${body}\n  </channel>\n</rss>\n`;
}

function delimited(items: FeedItem[], sep: "\t" | ","): string {
  const cell = (v: unknown) => {
    let s = Array.isArray(v) ? v.join(",") : String(v ?? "");
    s = s.replace(/[\t\r\n]+/g, " ");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return sep === "," && /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [FEED_COLUMNS.join(sep), ...items.map((it) => FEED_COLUMNS.map((c) => cell(it[c as keyof FeedItem])).join(sep))].join("\n") + "\n";
}
export const feedTsv = (items: FeedItem[]) => delimited(items, "\t");
export const feedCsv = (items: FeedItem[]) => delimited(items, ",");
