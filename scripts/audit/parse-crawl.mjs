// Parses the read-only kornne.com crawl (data/source-crawl) into audit CSVs + a JSON snapshot.
// Usage: node scripts/audit/parse-crawl.mjs [crawlDir]
// Never invents values: anything not present on the source page stays empty and is flagged.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const CRAWL = resolve(process.argv[2] ?? join(ROOT, "data/source-crawl"));
const AUDIT = join(ROOT, "docs/audit");
const SNAP = join(ROOT, "src/data/source-snapshot");
mkdirSync(AUDIT, { recursive: true });
mkdirSync(SNAP, { recursive: true });

const ORIGIN = "https://kornne.com/";
const LANG_SWITCH = { tr: "tr/", en: "lang-eng/", fr: "lang-fr/", ru: "lang-ru/", ar: "lang-arabic/" };

// ---------- helpers ----------
const ENT = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ouml: "ö", Ouml: "Ö", uuml: "ü", Uuml: "Ü",
  ccedil: "ç", Ccedil: "Ç", iacute: "í", eacute: "é", Eacute: "É", egrave: "è", agrave: "à", acirc: "â",
  ecirc: "ê", icirc: "î", ocirc: "ô", ucirc: "û", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–",
  mdash: "—", hellip: "…", deg: "°", times: "×", reg: "®", copy: "©", laquo: "«", raquo: "»", middot: "·",
  euro: "€", sup2: "²", sup3: "³", plusmn: "±", frac12: "½", bull: "•", ordm: "º", szlig: "ß",
};
const decode = (s) =>
  (s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENT[n] ?? m);
const strip = (html) => decode((html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d|div|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
const one = (re, s) => (s.match(re)?.[1] ?? "").trim();
const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n") + "\n";
/** "1.807.479,94 TL" -> "1807479.94" (string decimal; no float math) */
function parsePrice(txt) {
  const m = decode(txt ?? "").replace(/\s/g, "").match(/([\d.]+,\d{2}|[\d.]+)(TL|₺)?/);
  if (!m) return "";
  const [intPart, frac = "00"] = m[1].split(",");
  const digits = intPart.replace(/\./g, "");
  if (!/^\d+$/.test(digits)) return "";
  return `${String(BigInt(digits))}.${frac.padEnd(2, "0").slice(0, 2)}`;
}
const toKurus = (dec) => (dec ? BigInt(dec.replace(".", "")) : null);
const absUrl = (p) => {
  try { return new URL(decode(p), ORIGIN).href.replace("https://www.kornne.com/", ORIGIN); } catch { return ""; }
};

// ---------- load crawl logs ----------
const logs = [];
for (const f of ["crawl-log-tr.json", "crawl-log-i18n.json"]) {
  const p = join(CRAWL, f);
  // first run's non-TR entries were meta-refresh stubs (language is session-based) and are superseded by the i18n run
  const keep = (e) => e.file && (f !== "crawl-log-tr.json" || e.lang === "tr") && existsSync(join(CRAWL, "html", e.file));
  if (existsSync(p)) logs.push(...JSON.parse(readFileSync(p, "utf8")).filter(keep));
}
if (!logs.length) throw new Error(`No crawl logs in ${CRAWL}`);

function pageType(path) {
  if (path === "" || Object.values(LANG_SWITCH).includes(path)) return "home";
  const seg = path.split("/")[0];
  return { kategori: "category", urun: "product", sayfa: "cms_page", blog: "blog" }[seg] ?? "utility";
}

const pages = [];
const products = new Map(); // key: `${lang}:${source_id}`
const listings = []; // category listing rows
const cmsPages = []; // corporate / legal page bodies
const media = new Map(); // url -> {usages:Set}
const addMedia = (url, usage, alt = "") => {
  if (!url || url.startsWith("data:")) return;
  const u = absUrl(url);
  if (!u.startsWith(ORIGIN)) return;
  const m = media.get(u) ?? { usages: new Set(), alts: new Set() };
  m.usages.add(usage);
  if (alt) m.alts.add(alt);
  media.set(u, m);
};

for (const e of logs) {
  const html = readFileSync(join(CRAWL, "html", e.file), "utf8");
  const type = pageType(e.path);
  const robotsMetas = [...html.matchAll(/<meta name="(?:robots|googlebot)" content="([^"]*)"/gi)].map((m) => m[1]);
  const jsonLdTypes = [...html.matchAll(/"@type":\s*"([^"]+)"/g)].map((m) => m[1]);
  const h1 = strip(one(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html));
  const title = strip(one(/<title>([\s\S]*?)<\/title>/i, html));
  const htmlLang = one(/<html[^>]*lang="([^"]*)"/i, html);
  const htmlDir = one(/<html[^>]*dir="([^"]*)"/i, html);
  pages.push({
    url: ORIGIN + e.path,
    session_lang: e.lang,
    page_type: type,
    http_status: e.status,
    title,
    h1,
    meta_description: decode(one(/<meta name="description" content="([^"]*)"/i, html)),
    canonical: one(/<link rel="canonical" href="([^"]*)"/i, html),
    og_image: one(/<meta property="og:image" content="([^"]*)"/i, html),
    html_lang: htmlLang,
    html_dir: htmlDir,
    hreflang_count: (html.match(/hreflang=/gi) ?? []).length,
    robots_meta: robotsMetas.join(" | "),
    jsonld_types: [...new Set(jsonLdTypes)].join(" "),
    bytes: e.bytes,
    sha256: e.sha256,
    captured_at: e.captured_at,
  });

  // global brand assets
  for (const m of html.matchAll(/<link rel="(?:shortcut )?icon"[^>]*href="([^"]+)"/gi)) addMedia(m[1], "favicon");
  for (const m of html.matchAll(/<img[^>]*src="([^"]*(?:logo|Logo)[^"]*)"[^>]*>/g)) addMedia(m[1], "logo");

  if (type === "home") {
    for (const m of html.matchAll(/<img[^>]*src="(upload\/[^"]+)"(?:[^>]*alt="([^"]*)")?/g)) addMedia(m[1], `home:${e.lang}`, decode(m[2] ?? ""));
  }

  if (type === "cms_page") {
    const section = one(/<section class="row mb-50">([\s\S]*?)<\/section>/, html);
    const heroImg = one(/<img src="([^"]+)" class="ozelimg"/, section);
    const heading = strip(one(/<h2[^>]*>([\s\S]*?)<\/h2>/, section));
    const body = section.split(/<\/h2>/).slice(1).join("</h2>");
    const bodyImages = [...body.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => absUrl(m[1]));
    if (heroImg) addMedia(heroImg, `page:${e.lang}:${e.path}:hero`);
    bodyImages.forEach((u) => addMedia(u, `page:${e.lang}:${e.path}`));
    cmsPages.push({ locale: e.lang, path: e.path, slug: decode(e.path.replace(/^sayfa\//, "")), title: heading || h1 || title, hero_image: heroImg ? absUrl(heroImg) : "", body_html: body.trim(), body_text: strip(body), body_images: bodyImages, source_url: ORIGIN + e.path, captured_at: e.captured_at, page_sha256: e.sha256 });
  }

  if (type === "category") {
    const [, slug, pageNo = "1"] = e.path.split("/");
    const total = one(/Ürün sayısı\s*:\s*<strong[^>]*>(\d+)</i, html) || one(/<strong class="text-brand">(\d+)<\/strong>/, html);
    const cards = html.split('<div class="product-cart-wrap').slice(1);
    let pos = 0;
    for (const c of cards) {
      pos++;
      const href = one(/<a href="(urun\/[^"]+)"/, c);
      const img = c.match(/<img src="([^"]+)" alt="([^"]*)"/);
      const priceBlock = one(/<div class="product-price">([\s\S]*?)<\/div>/, c);
      const spans = [...priceBlock.matchAll(/<span(?: class="([^"]*)")?>([\s\S]*?)<\/span>/g)];
      const oldP = spans.find((s) => s[1] === "old-price")?.[2];
      const disc = spans.find((s) => s[1] === "indirim")?.[2];
      const cur = spans.find((s) => !s[1])?.[2];
      const badge = one(/class="etiket" style="background: url\(([^)]+)\)/, c);
      listings.push({
        session_lang: e.lang,
        category_slug: decode(slug),
        page: pageNo,
        reported_total: total,
        position: pos,
        source_id: one(/data-favori-ekle="(\d+)"/, c),
        product_path: decode(href),
        card_title: strip(one(/<h2><a[^>]*>([\s\S]*?)<\/a><\/h2>/, c)),
        card_image: img ? absUrl(img[1]) : "",
        card_badge_image: badge ? absUrl(badge) : "",
        price: parsePrice(cur),
        old_price: parsePrice(oldP),
        discount_label: decode(disc ?? "").trim(),
        rating_widget_width: one(/class="product-rating" style="width: ([^"]+)"/, c),
      });
      if (img) addMedia(img[1], `card:${decode(href)}`, decode(img[2]));
      if (badge) addMedia(badge, "card-badge");
    }
  }

  if (type === "product") {
    const sourceId = one(/urun-id=(\d+)/, html) || one(/data-favori-ekle="(\d+)"[^>]*class="action-btn hover-up"/, html);
    const detail = html.split('<div class="product-detail accordion-detail')[1] ?? "";
    const gallery = one(/<div class="product-image-slider">([\s\S]*?)<\/div>/, detail);
    const images = [...gallery.matchAll(/<img src="([^"]+)" alt="([^"]*)"/g)].map((m) => ({ src: absUrl(m[1]), alt: decode(m[2]) }));
    images.forEach((im, i) => addMedia(im.src, `product:${e.lang}:${e.path}${i === 0 ? ":main" : ""}`, im.alt));
    const cur = one(/id="guncel_fiyat">([\s\S]*?)<\/span>/, detail);
    const oldP = one(/<span class="old-price[^"]*">([\s\S]*?)<\/span>/, detail);
    const save = strip(one(/<span class="save-price[^"]*">([\s\S]*?)<\/span>/, detail));
    const shortDescs = [...detail.matchAll(/<div class="short-desc[^"]*">([\s\S]*?)<\/div>/g)].map((m) => strip(m[1])).filter(Boolean);
    const descHtml = one(/<div class="tab-pane fade show active" id="[^"]*">\s*<div class="">([\s\S]*?)<\/div>\s*<\/div>/, html);
    const crumb = one(/<div class="breadcrumb">([\s\S]*?)<\/div>/, html);
    const crumbParts = strip(crumb.replace(/<span><\/span>/g, "\n")).split("\n").map((s) => s.trim()).filter(Boolean);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const productLd = ld.find((s) => /"@type":\s*"Product"/.test(s)) ?? "";
    const pdfs = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((m) => absUrl(m[1]));
    const videos = [...html.matchAll(/(?:youtube\.com\/embed\/|youtu\.be\/)([\w-]{6,})/g)].map((m) => m[1]);
    // real variant markup: <strong>Label: </strong><ul data-anavaryant-id-dis="344"><li data-alt-varyant-id="905">..</li></ul>
    // (the string also appears inside the page's cart JS, so match the attribute with a value)
    const variants = [...html.matchAll(/<strong[^>]*>([^<]*)<\/strong>\s*<ul[^>]*data-anavaryant-id-dis="(\d+)"[^>]*>([\s\S]*?)<\/ul>/g)].map((m) => ({
      group_id: m[2],
      label: decode(m[1]).replace(/:\s*$/, "").trim(),
      options: [...m[3].matchAll(/data-alt-varyant-id="(\d+)"[^>]*><a[^>]*>([^<]*)<\/a>/g)].map((o) => ({ id: o[1], label: decode(o[2]).trim() })),
    }));
    const variantGroups = variants.length;
    const reviewsTab = strip(one(/id="yorum-tab"[^>]*>([\s\S]*?)<\/a>/, html));
    const price = parsePrice(cur);
    const oldPrice = parsePrice(oldP);
    const flags = [];
    if (!price) flags.push("price_missing");
    if (price && oldPrice && toKurus(oldPrice) <= toKurus(price)) flags.push("old_price_not_higher_than_price");
    if (!descHtml || strip(descHtml).length < 40) flags.push("description_thin_or_empty");
    if (images.length === 0) flags.push("no_images");
    if (images.some((i) => !i.alt)) flags.push("image_alt_missing");
    if (/"aggregateRating"/.test(productLd)) flags.push("jsonld_aggregate_rating_without_reviews");
    if (/"AggregateOffer"/.test(productLd)) flags.push("jsonld_aggregate_offer_mismatch");
    // first short-desc block holds a bare number that matches the JSON-LD "sku" -> likely the shop's stock code (unverified)
    const codeCandidate = shortDescs.find((s) => /^\d+$/.test(s)) ?? "";
    if (codeCandidate) flags.push("stock_code_only_in_short_desc");
    const shortTitle = shortDescs.find((s) => !/^\d+$/.test(s)) ?? "";
    const norm = (x) => x.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
    if (shortTitle && h1 && norm(shortTitle) !== norm(h1)) flags.push(`short_desc_title_mismatch(${shortTitle})`);
    products.set(`${e.lang}:${sourceId || e.path}`, {
      source_id: sourceId,
      locale: e.lang,
      source_url: ORIGIN + e.path,
      slug: decode(e.path.replace(/^urun\//, "")),
      title: h1,
      meta_title: title,
      meta_description: decode(one(/<meta name="description" content="([^"]*)"/i, html)),
      category_breadcrumb: crumbParts.slice(1, -1).join(" > "),
      currency: price ? "TRY" : "",
      price,
      old_price: oldPrice,
      price_raw: strip(cur),
      old_price_raw: strip(oldP),
      discount_label: save,
      availability: "unknown",
      sku: "",
      stock_code_candidate: codeCandidate,
      jsonld_sku: one(/"sku":\s*"([^"]*)"/, productLd),
      jsonld_brand: one(/"brand":\s*\{[^}]*"name":\s*"([^"]*)"/, productLd),
      jsonld_low_price: one(/"lowPrice":\s*"([^"]*)"/, productLd),
      short_desc: shortDescs.join(" | "),
      description_text: strip(descHtml),
      description_html: descHtml.trim(),
      images: images.map((i) => i.src),
      image_alts: images.map((i) => i.alt),
      pdfs,
      videos,
      variant_groups: variantGroups,
      variants,
      reviews_tab: reviewsTab,
      view_count: one(/Görüntülenme Sayısı:\s*(\d+)/, html),
      whatsapp_link: decode(one(/href="(https:\/\/api\.whatsapp\.com\/send[^"]+)"/, html)),
      flags,
      verification_status: "unverified",
      captured_at: e.captured_at,
      page_sha256: e.sha256,
    });
  }
}

// category membership from listings (tr)
const membership = new Map();
for (const l of listings) {
  if (!l.source_id) continue;
  const k = `${l.session_lang}:${l.source_id}`;
  const s = membership.get(k) ?? new Set();
  s.add(l.category_slug);
  membership.set(k, s);
}
// listing price vs detail price consistency
for (const l of listings) {
  const p = products.get(`${l.session_lang}:${l.source_id}`);
  if (p && l.price && p.price && l.price !== p.price) p.flags.push(`listing_price_differs(${l.category_slug}:${l.price})`);
}
const skuCount = new Map();
for (const p of products.values()) if (p.jsonld_sku) skuCount.set(`${p.locale}:${p.jsonld_sku}`, (skuCount.get(`${p.locale}:${p.jsonld_sku}`) ?? 0) + 1);
for (const p of products.values()) {
  if (p.variant_groups) p.flags.push("has_variants_price_per_variant_unverified");
  if ((skuCount.get(`${p.locale}:${p.jsonld_sku}`) ?? 0) > 1) p.flags.push("jsonld_sku_duplicate");
  p.categories = [...(membership.get(`${p.locale}:${p.source_id}`) ?? [])];
  p.flags = [...new Set(p.flags)];
}

// ---------- write outputs ----------
const prodRows = [...products.values()].sort((a, b) => a.locale.localeCompare(b.locale) || +a.source_id - +b.source_id);
writeFileSync(
  join(AUDIT, "product-inventory.csv"),
  toCsv(
    prodRows.map((p) => ({ ...p, categories: p.categories.join("|"), image_count: p.images.length, main_image: p.images[0] ?? "", flags: p.flags.join("|"), description_chars: p.description_text.length })),
    ["source_url", "source_id", "sku", "stock_code_candidate", "locale", "title", "currency", "price", "old_price", "availability", "verification_status", "captured_at", "slug", "categories", "category_breadcrumb", "discount_label", "image_count", "main_image", "description_chars", "variant_groups", "reviews_tab", "view_count", "jsonld_sku", "jsonld_brand", "jsonld_low_price", "meta_title", "meta_description", "flags"],
  ),
);
writeFileSync(
  join(AUDIT, "category-listing-inventory.csv"),
  toCsv(listings, ["session_lang", "category_slug", "page", "reported_total", "position", "source_id", "product_path", "card_title", "price", "old_price", "discount_label", "rating_widget_width", "card_image", "card_badge_image"]),
);
writeFileSync(
  join(AUDIT, "page-inventory.csv"),
  toCsv(pages, ["url", "session_lang", "page_type", "http_status", "title", "h1", "meta_description", "canonical", "og_image", "html_lang", "html_dir", "hreflang_count", "robots_meta", "jsonld_types", "bytes", "sha256", "captured_at"]),
);
const mediaRows = [...media.entries()].map(([url, m]) => ({
  url,
  filename: decodeURIComponent(url.split("/").pop()),
  kind: [...m.usages].some((u) => u === "logo" || u === "favicon") ? "brand" : [...m.usages].some((u) => u.startsWith("product")) ? "product" : "site",
  usage_count: m.usages.size,
  usages: [...m.usages].slice(0, 12).join("|"),
  alts: [...m.alts].join("|"),
}));
// keep columns added by mirror-media.mjs (bytes, sha256, dimensions...) when re-parsing
const MIRROR_COLS = ["http_status", "mirror_status", "bytes", "sha256", "width", "height", "format", "merchant_500px_ok", "duplicate_of", "local_file"];
const mediaCsv = join(AUDIT, "media-inventory.csv");
if (existsSync(mediaCsv)) {
  const [hdrLine, ...lines] = readFileSync(mediaCsv, "utf8").split("\n").filter(Boolean);
  const hdr = hdrLine.split(",");
  if (hdr.includes("sha256")) {
    const splitCsv = (l) => { const o = []; let c = "", q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === ",") { o.push(c); c = ""; } else c += ch; } o.push(c); return o; };
    const prev = new Map(lines.map((l) => { const v = splitCsv(l); return [v[0], Object.fromEntries(hdr.map((h, i) => [h, v[i]]))]; }));
    for (const r of mediaRows) for (const c of MIRROR_COLS) r[c] = prev.get(r.url)?.[c] ?? "";
  }
}
writeFileSync(mediaCsv, toCsv(mediaRows.sort((a, b) => a.url.localeCompare(b.url)), ["url", "filename", "kind", "usage_count", "usages", "alts", ...MIRROR_COLS]));

// snapshot for the Sprint 1 page templates (read-only preview data, never indexed / never sent to Merchant)
const snapshot = {
  _meta: {
    source: "https://kornne.com (public storefront, read-only crawl)",
    captured_at: logs.map((l) => l.captured_at).sort()[0],
    status: "unverified — preview only; Sprint 2 import replaces this with DB data",
  },
  // product links in the order the legacy TR homepage shows them (editorial "featured" order)
  home_featured: [...new Set([...readFileSync(join(CRAWL, "html", "tr__home.html"), "utf8").matchAll(/href="urun\/([^"]+)"/g)].map((m) => decode(m[1])))],
  categories: [...new Set(listings.filter((l) => l.session_lang === "tr").map((l) => l.category_slug))].map((slug) => ({
    slug,
    reported_total: listings.find((l) => l.category_slug === slug)?.reported_total ?? "",
    title: pages.find((p) => p.url === `${ORIGIN}kategori/${slug}` && p.session_lang === "tr")?.title ?? slug,
  })),
  pages: cmsPages,
  products: prodRows.filter((p) => p.locale === "tr").map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== "meta_description"))),
  // full legacy EN/FR records (separate products on the source site) — kept verbatim for LegacySourceRecord
  translations: prodRows.filter((p) => p.locale !== "tr"),
};
writeFileSync(join(SNAP, "catalog.json"), JSON.stringify(snapshot, null, 1));

console.log(`pages=${pages.length} products=${prodRows.length} (tr=${prodRows.filter((p) => p.locale === "tr").length}) listings=${listings.length} media=${mediaRows.length}`);
