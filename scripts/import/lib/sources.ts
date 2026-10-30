/** Loads the Sprint 0 audit artefacts that feed the importer (read-only). */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Project root (scripts and tests run from it via npm / vitest / playwright). */
export const ROOT = resolve(process.env.KORNNE_ROOT ?? process.cwd());

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const [hdr, ...data] = rows;
  return data.filter((r) => r.length > 1).map((r) => Object.fromEntries(hdr!.map((h, i) => [h, r[i] ?? ""])));
}

export type SnapshotProduct = {
  source_id: string;
  locale: string;
  source_url: string;
  slug: string;
  title: string;
  meta_title: string;
  category_breadcrumb: string;
  currency: string;
  price: string;
  old_price: string;
  price_raw: string;
  old_price_raw: string;
  discount_label: string;
  availability: string;
  sku: string;
  stock_code_candidate: string;
  jsonld_sku: string;
  jsonld_brand: string;
  jsonld_low_price: string;
  short_desc: string;
  description_text: string;
  description_html: string;
  images: string[];
  image_alts: string[];
  pdfs: string[];
  videos: string[];
  variant_groups: number;
  variants: { group_id: string; label: string; options: { id: string; label: string }[] }[];
  reviews_tab: string;
  view_count: string;
  whatsapp_link: string;
  flags: string[];
  verification_status: string;
  captured_at: string;
  page_sha256: string;
  categories: string[];
};

type Cols<K extends string> = { [P in K]: string };
export type MediaRow = Cols<"url" | "filename" | "kind" | "usage_count" | "usages" | "alts" | "http_status" | "mirror_status" | "bytes" | "sha256" | "width" | "height" | "format" | "merchant_500px_ok" | "duplicate_of" | "local_file">;
export type RedirectRow = Cols<"old_url" | "old_path" | "session_lang" | "page_type" | "title" | "new_path" | "status" | "note">;
export type PageRow = Cols<"url" | "session_lang" | "page_type" | "http_status" | "title" | "h1" | "meta_description" | "canonical" | "og_image" | "html_lang" | "html_dir" | "hreflang_count" | "robots_meta" | "jsonld_types" | "bytes" | "sha256" | "captured_at">;
export type ListingRow = Cols<"session_lang" | "category_slug" | "page" | "reported_total" | "position" | "source_id" | "product_path" | "card_title" | "price" | "old_price" | "discount_label" | "rating_widget_width" | "card_image" | "card_badge_image">;

export type Sources = {
  catalog: {
    _meta: { captured_at: string };
    home_featured: string[];
    categories: { slug: string; reported_total: string; title: string }[];
    pages: { locale: string; slug: string; title: string; source_url: string; captured_at: string; page_sha256: string; body_html: string; body_images: string[]; hero_image: string }[];
    products: SnapshotProduct[];
    translations: SnapshotProduct[];
  };
  localeMap: {
    categories: { key: string; isAllProducts: boolean; locales: Record<string, { legacySlug: string; slug: string; name: string; sourceUrl: string }> }[];
    products: { tr: string; en: string | null; fr: string | null }[];
  };
  media: MediaRow[];
  redirects: RedirectRow[];
  pages: PageRow[];
  listings: ListingRow[];
  sourceHash: string;
};

const FILES = {
  catalog: "src/data/source-snapshot/catalog.json",
  localeMap: "src/data/source-snapshot/locale-map.json",
  media: "docs/audit/media-inventory.csv",
  redirects: "docs/audit/redirect-map.csv",
  pages: "docs/audit/page-inventory.csv",
  listings: "docs/audit/category-listing-inventory.csv",
} as const;

export function loadSources(root = ROOT): Sources {
  const raw = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(join(root, f), "utf8")])) as Record<keyof typeof FILES, string>;
  const sourceHash = createHash("sha256").update(Object.values(raw).join("\u0000")).digest("hex");
  return {
    catalog: JSON.parse(raw.catalog),
    localeMap: JSON.parse(raw.localeMap),
    media: parseCsv(raw.media) as MediaRow[],
    redirects: parseCsv(raw.redirects) as RedirectRow[],
    pages: parseCsv(raw.pages) as PageRow[],
    listings: parseCsv(raw.listings) as ListingRow[],
    sourceHash,
  };
}
