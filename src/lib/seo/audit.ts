/**
 * Technical SEO audit (Sprint 8) — pure analysis of real HTTP responses, URL by URL. Used by the admin "SEO QA" screen
 * and by `scripts/seo/audit.ts`. No DOM dependency: the HTML is the one our own app renders, parsed with targeted
 * regular expressions. Two modes:
 *  - "dev"      : the current environment — EVERY page must be noindex, robots.txt must disallow all, sitemap empty
 *  - "prodlike" : offline production-like preview (localhost, isolated DB, SITE_INDEXABLE + CATALOG_DATA_VERIFIED)
 */
export type AuditMode = "dev" | "prodlike";
export type Severity = "error" | "warning" | "info";
export type Finding = { code: string; severity: Severity; message: string; fix: string };

export type PageKind = "home" | "category" | "category-page" | "category-filter" | "product" | "product-missing-locale" | "cms" | "cms-fallback" | "legal" | "blog" | "faq" | "search" | "contact" | "quote" | "cart" | "checkout" | "404" | "admin" | "legacy-redirect" | "held-product";

export type PageExpect = {
  path: string;
  kind: PageKind;
  status: number;
  /** expected indexability in prodlike mode (dev mode: always false) */
  indexable?: boolean;
  /** redirects: expected target path */
  location?: string;
  lang?: string;
  dir?: "ltr" | "rtl";
  /** canonical should point to this path instead of self (filtered listings) */
  canonicalPath?: string;
};

export type PageResult = {
  path: string;
  kind: PageKind;
  status: number;
  location: string | null;
  indexable: boolean;
  robots: string | null;
  xRobotsTag: string | null;
  canonical: string | null;
  hreflang: Record<string, string>;
  title: string | null;
  description: string | null;
  h1Count: number;
  lang: string | null;
  dir: string | null;
  ogTitle: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  jsonLdTypes: string[];
  imgCount: number;
  imgWithoutAlt: number;
  findings: Finding[];
};

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`, "i"));
  return m ? decode(m[2] ?? m[3] ?? "") : null;
};
const tags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`, "gi")) ?? [];
function meta(html: string, key: "name" | "property", value: string): string | null {
  for (const t of tags(html, "meta")) if (attr(t, key)?.toLowerCase() === value) return attr(t, "content");
  return null;
}

/** Recursively collects every "@type" and flags commercial keys anywhere in a JSON-LD graph. */
function ldTypes(node: unknown, out: Set<string>, keys: Set<string>) {
  if (Array.isArray(node)) return node.forEach((n) => ldTypes(n, out, keys));
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "@type") (Array.isArray(v) ? v : [v]).forEach((t) => out.add(String(t)));
    if (["offers", "aggregateRating", "review", "priceSpecification", "shippingDetails", "hasMerchantReturnPolicy"].includes(k)) keys.add(k);
    ldTypes(v, out, keys);
  }
}

export function parseHtml(html: string) {
  const head = html.slice(0, html.search(/<\/head>/i) + 7 || undefined);
  const htmlTag = tags(html, "html")[0] ?? "";
  const links = tags(head, "link");
  const hreflang: Record<string, string> = {};
  let canonical: string | null = null;
  for (const l of links) {
    const rel = attr(l, "rel")?.toLowerCase();
    if (rel === "canonical") canonical = attr(l, "href");
    if (rel === "alternate" && attr(l, "hreflang")) hreflang[attr(l, "hreflang")!.toLowerCase()] = attr(l, "href") ?? "";
  }
  const types = new Set<string>();
  const commercial = new Set<string>();
  let ldInvalid = 0;
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      ldTypes(JSON.parse(m[1]!), types, commercial);
    } catch {
      ldInvalid++;
    }
  }
  const imgs = tags(html, "img");
  const body = html.slice(html.search(/<body/i));
  return {
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]!.trim()) : null,
    description: meta(head, "name", "description"),
    robots: meta(head, "name", "robots"),
    canonical,
    hreflang,
    h1Count: (body.match(/<h1\b/gi) ?? []).length,
    lang: attr(htmlTag, "lang"),
    dir: attr(htmlTag, "dir"),
    ogTitle: meta(head, "property", "og:title"),
    ogImage: meta(head, "property", "og:image"),
    twitterCard: meta(head, "name", "twitter:card"),
    jsonLdTypes: [...types],
    commercialKeys: [...commercial],
    jsonLdInvalid: ldInvalid,
    imgCount: imgs.length,
    imgWithoutAlt: imgs.filter((i) => attr(i, "alt") === null).length,
  };
}

const F = (code: string, severity: Severity, message: string, fix: string): Finding => ({ code, severity, message, fix });
const pathOf = (u: string, base: string) => {
  try {
    const x = new URL(u, base);
    return decodeURIComponent(x.pathname) + x.search;
  } catch {
    return u;
  }
};

export function analyzePage(input: { expect: PageExpect; status: number; headers: Record<string, string>; html: string; base: string; mode: AuditMode }): PageResult {
  const { expect: e, status, headers, base, mode } = input;
  const findings: Finding[] = [];
  const location = headers["location"] ?? null;
  const xRobots = headers["x-robots-tag"] ?? null;
  const isHtml = (headers["content-type"] ?? "").includes("text/html");
  const p = isHtml && input.html ? parseHtml(input.html) : null;
  const noindexMeta = !!p?.robots && /noindex/i.test(p.robots);
  const noindexHeader = !!xRobots && /noindex/i.test(xRobots);
  const indexable = status === 200 && !noindexMeta && !noindexHeader;

  if (status !== e.status) findings.push(F("status", "error", `HTTP ${status}, beklenen ${e.status}`, e.status === 301 || e.status === 307 ? "Yönlendirme kaydını kontrol edin" : "Sayfanın yayın durumunu / rotasını kontrol edin"));
  if (e.location && status >= 300 && status < 400 && pathOf(location ?? "", base) !== e.location) findings.push(F("redirect-target", "error", `Yönlendirme hedefi ${location}, beklenen ${e.location}`, "Redirect tablosunu düzeltin"));
  if (mode === "dev" && status === 200 && !(noindexMeta || noindexHeader)) findings.push(F("noindex-leak", "error", "Geliştirme/staging ortamında indekslenebilir sayfa", "SITE_INDEXABLE ortam ayarını kapalı tutun"));
  if (mode === "prodlike" && status === 200 && e.indexable !== undefined && indexable !== e.indexable) findings.push(F(e.indexable ? "unexpected-noindex" : "unexpected-index", "error", e.indexable ? "Üretimde indekslenmesi gereken sayfa noindex" : "Üretimde noindex olması gereken sayfa indekslenebilir", e.indexable ? "Sayfanın noindex koşulunu inceleyin" : "Sayfaya noindex ekleyin"));

  if (p && status === 200) {
    if (!p.title) findings.push(F("title-missing", "error", "Başlık yok", "SEO başlığı girin"));
    else if (p.title.length > 70) findings.push(F("title-long", "warning", `Başlık ${p.title.length} karakter`, "≈60 karaktere kısaltın"));
    else if (p.title.length < 10) findings.push(F("title-short", "warning", `Başlık ${p.title.length} karakter`, "Açıklayıcı bir başlık yazın"));
    if (!p.description) findings.push(F("description-missing", "warning", "Meta açıklama yok", "SEO açıklaması girin"));
    else if (p.description.length > 170) findings.push(F("description-long", "warning", `Açıklama ${p.description.length} karakter`, "≈160 karaktere kısaltın"));
    if (e.kind !== "admin" && p.h1Count !== 1) findings.push(F("h1-count", "warning", `${p.h1Count} adet H1`, "Sayfada tek H1 kullanın"));
    if (e.lang && p.lang !== e.lang) findings.push(F("lang", "error", `html lang="${p.lang}", beklenen ${e.lang}`, "Locale layout'unu kontrol edin"));
    if (e.dir && p.dir !== e.dir) findings.push(F("dir", "error", `dir="${p.dir}", beklenen ${e.dir}`, "RTL ayarını kontrol edin"));
    if (e.kind !== "admin") {
      if (!p.canonical) findings.push(F("canonical-missing", "error", "Canonical yok", "buildMetadata kullanın"));
      else {
        const c = new URL(p.canonical, base);
        if (mode === "prodlike" && c.origin !== new URL(base).origin) findings.push(F("canonical-origin", "error", `Canonical başka origin: ${c.origin}`, "SITE_URL ayarını kontrol edin"));
        const want = e.canonicalPath ?? e.path.split("?")[0]!;
        if (decodeURIComponent(c.pathname) !== want) findings.push(F("canonical-target", e.canonicalPath ? "error" : "warning", `Canonical ${decodeURIComponent(c.pathname)}, beklenen ${want}`, "Canonical yolunu düzeltin"));
      }
      if (!p.ogTitle || !p.ogImage) findings.push(F("og-missing", "warning", "Open Graph başlık/görsel eksik", "buildMetadata image alanını verin"));
      if (!p.twitterCard) findings.push(F("twitter-missing", "info", "Twitter card yok", "buildMetadata twitter alanı"));
    }
    const langs = Object.keys(p.hreflang);
    if (langs.length) {
      if (!p.hreflang["x-default"]) findings.push(F("hreflang-xdefault", "warning", "hreflang var ama x-default yok", "Türkçe sürümü x-default yapın"));
      const selfLang = (p.lang ?? "").toLowerCase();
      if (selfLang && !p.hreflang[selfLang]) findings.push(F("hreflang-self", "error", `hreflang kendi dilini (${selfLang}) içermiyor`, "Alternatiflere sayfanın kendisini ekleyin"));
    }
    if (p.commercialKeys.length) findings.push(F("ld-commercial", "error", `JSON-LD ticari alan içeriyor: ${p.commercialKeys.join(", ")}`, "Doğrulanmamış fiyat/değerlendirme yapılandırılmış verisi üretmeyin"));
    for (const t of ["Offer", "AggregateOffer", "AggregateRating", "Review"]) if (p.jsonLdTypes.includes(t)) findings.push(F("ld-forbidden", "error", `JSON-LD tipi ${t}`, "Kaldırın — doğrulanmış veri yok"));
    if (p.jsonLdInvalid) findings.push(F("ld-invalid", "error", `${p.jsonLdInvalid} JSON-LD bloğu ayrıştırılamadı`, "serializeJsonLd kullanın"));
    if (p.imgWithoutAlt) findings.push(F("img-alt", "warning", `${p.imgWithoutAlt} görselde alt özniteliği yok`, "alt ekleyin (dekoratifse alt=\"\")"));
  }
  return {
    path: e.path,
    kind: e.kind,
    status,
    location,
    indexable,
    robots: p?.robots ?? null,
    xRobotsTag: xRobots,
    canonical: p?.canonical ?? null,
    hreflang: p?.hreflang ?? {},
    title: p?.title ?? null,
    description: p?.description ?? null,
    h1Count: p?.h1Count ?? 0,
    lang: p?.lang ?? null,
    dir: p?.dir ?? null,
    ogTitle: p?.ogTitle ?? null,
    ogImage: p?.ogImage ?? null,
    twitterCard: p?.twitterCard ?? null,
    jsonLdTypes: p?.jsonLdTypes ?? [],
    imgCount: p?.imgCount ?? 0,
    imgWithoutAlt: p?.imgWithoutAlt ?? 0,
    findings,
  };
}

/** Cross-page rules: hreflang reciprocity, alternates pointing at non-200 pages, duplicate titles among indexable pages. */
export function crossCheck(results: PageResult[], base: string): void {
  const byPath = new Map(results.map((r) => [r.path.split("?")[0]!, r]));
  for (const r of results) {
    if (r.status !== 200) continue;
    for (const [lang, href] of Object.entries(r.hreflang)) {
      if (lang === "x-default") continue;
      const target = byPath.get(pathOf(href, base));
      if (!target) continue;
      if (target.status !== 200) r.findings.push(F("hreflang-broken", "error", `hreflang ${lang} → ${pathOf(href, base)} HTTP ${target.status}`, "Yalnız yayımlanmış çevirilere hreflang verin"));
      else if (!Object.values(target.hreflang).some((h) => pathOf(h, base) === r.path.split("?")[0])) r.findings.push(F("hreflang-reciprocal", "error", `${pathOf(href, base)} bu sayfaya geri bağlanmıyor`, "Alternatif setleri iki yönlü olmalı"));
    }
  }
  const titles = new Map<string, PageResult[]>();
  // only self-canonical pages compete for a title (filtered/sorted variants canonicalise to the base listing)
  const selfCanonical = (r: PageResult) => !r.canonical || pathOf(r.canonical, base) === r.path;
  for (const r of results) if (r.indexable && r.title && selfCanonical(r)) titles.set(r.title, [...(titles.get(r.title) ?? []), r]);
  for (const [t, rs] of titles) if (rs.length > 1) for (const r of rs) r.findings.push(F("title-duplicate", "warning", `Aynı başlık ${rs.length} sayfada: “${t.slice(0, 60)}”`, "Sayfaya özgü başlık yazın"));
}

export type SitemapReport = { urlCount: number; imageCount: number; findings: Finding[]; urls: { loc: string; lastmod: string | null; images: number; alternates: number }[] };

export function analyzeSitemap(xml: string, mode: AuditMode, results: PageResult[], base: string, fetchedAt: Date): SitemapReport {
  const findings: Finding[] = [];
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => {
    const block = m[1]!;
    return { loc: decode(block.match(/<loc>([^<]*)<\/loc>/)?.[1] ?? ""), lastmod: block.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1] ?? null, images: (block.match(/<image:loc>/g) ?? []).length, alternates: (block.match(/<xhtml:link/g) ?? []).length };
  });
  if (mode === "dev" && urls.length) findings.push(F("sitemap-dev-not-empty", "error", `Geliştirme ortamı sitemap'inde ${urls.length} URL`, "Sitemap indekslenemez ortamda boş kalmalı"));
  if (mode === "prodlike") {
    if (!urls.length) findings.push(F("sitemap-empty", "error", "Üretim önizlemesinde sitemap boş", "Kapıları kontrol edin"));
    const byPath = new Map(results.map((r) => [r.path.split("?")[0]!, r]));
    for (const u of urls) {
      const r = byPath.get(pathOf(u.loc, base));
      if (!r) findings.push(F("sitemap-unknown", "warning", `Envanterde olmayan URL: ${u.loc}`, "Envanteri / sitemap'i eşitleyin"));
      else if (r.status !== 200 || !r.indexable) findings.push(F("sitemap-not-indexable", "error", `${u.loc} → HTTP ${r.status}${r.indexable ? "" : ", noindex"}`, "Sitemap yalnız 200 + indekslenebilir URL içermeli"));
      else if (r.canonical && pathOf(r.canonical, base) !== pathOf(u.loc, base)) findings.push(F("sitemap-canonical", "error", `${u.loc} canonical değil (${r.canonical})`, "Sitemap'e canonical URL yazın"));
      if (u.lastmod) {
        const t = Date.parse(u.lastmod);
        if (Number.isNaN(t)) findings.push(F("sitemap-lastmod-invalid", "error", `Geçersiz lastmod: ${u.lastmod}`, "ISO tarih"));
        else if (Math.abs(fetchedAt.getTime() - t) < 60_000) findings.push(F("sitemap-lastmod-now", "warning", `${u.loc} lastmod istek anına eşit (uydurma tarih şüphesi)`, "Gerçek güncelleme tarihini kullanın"));
      }
    }
    for (const r of results) if (r.indexable && r.status === 200 && !urls.some((u) => pathOf(u.loc, base) === r.path.split("?")[0]) && !["search", "category-page", "category-filter", "contact"].includes(r.kind)) findings.push(F("sitemap-missing", "info", `İndekslenebilir sayfa sitemap'te yok: ${r.path}`, "Gerekirse sitemap'e ekleyin"));
  }
  return { urlCount: urls.length, imageCount: urls.reduce((a, u) => a + u.images, 0), findings, urls };
}

export function analyzeRobots(txt: string, mode: AuditMode, base: string): Finding[] {
  const out: Finding[] = [];
  const disallowAll = /^\s*Disallow:\s*\/\s*$/im.test(txt);
  if (mode === "dev" && !disallowAll) out.push(F("robots-dev-open", "error", "Geliştirme robots.txt tüm siteyi engellemiyor", "Disallow: / olmalı"));
  if (mode === "prodlike") {
    if (disallowAll) out.push(F("robots-prod-closed", "error", "Üretim robots.txt tüm siteyi engelliyor", "SITE_INDEXABLE"));
    if (!new RegExp(`Sitemap:\\s*${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/sitemap\\.xml`, "i").test(txt)) out.push(F("robots-sitemap", "error", "robots.txt sitemap satırı yok/yanlış origin", "Sitemap: <origin>/sitemap.xml"));
    if (!/Disallow:\s*\/admin/i.test(txt)) out.push(F("robots-admin", "warning", "robots.txt /admin'i engellemiyor", "Disallow: /admin"));
  }
  return out;
}

export type AuditReport = { mode: AuditMode; base: string; startedAt: string; finishedAt: string; pages: PageResult[]; sitemap: SitemapReport; robots: Finding[]; summary: { urls: number; errors: number; warnings: number; byKind: Record<string, number>; byCode: Record<string, number> } };

/** Runs the audit against a base origin with the given fetch (real fetch in the app/script, a stub in unit tests). */
export async function runSeoAudit(opts: { base: string; mode: AuditMode; inventory: PageExpect[]; fetchImpl?: typeof fetch; concurrency?: number }): Promise<AuditReport> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const started = new Date();
  const get = async (path: string) => {
    const res = await fetchImpl(new URL(path, opts.base).toString(), { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "KORNNE-SEO-QA/1.0" } });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const html = (headers["content-type"] ?? "").includes("text/html") || path.endsWith(".xml") || path.endsWith(".txt") ? await res.text() : "";
    return { status: res.status, headers, html };
  };
  const pages: PageResult[] = [];
  const queue = [...opts.inventory];
  const workers = Array.from({ length: opts.concurrency ?? 4 }, async () => {
    for (let e = queue.shift(); e; e = queue.shift()) {
      try {
        const r = await get(e.path);
        const result = analyzePage({ expect: e, status: r.status, headers: r.headers, html: r.html, base: opts.base, mode: opts.mode });
        // redirects must land on a live page in ONE hop
        if (r.status >= 300 && r.status < 400 && r.headers["location"]) {
          const hop = await get(pathOf(r.headers["location"], opts.base));
          if (hop.status !== 200) result.findings.push(F("redirect-chain", "error", `Hedef HTTP ${hop.status} (zincir veya kırık hedef)`, "Yönlendirme tek adımda 200 sayfaya gitmeli"));
        }
        pages.push(result);
      } catch (err) {
        pages.push({ ...analyzePage({ expect: e, status: 0, headers: {}, html: "", base: opts.base, mode: opts.mode }), findings: [F("fetch-failed", "error", `İstek başarısız: ${err instanceof Error ? err.message.slice(0, 80) : "bilinmiyor"}`, "Sunucuyu kontrol edin")] });
      }
    }
  });
  await Promise.all(workers);
  pages.sort((a, b) => a.path.localeCompare(b.path));
  crossCheck(pages, opts.base);
  const sm = await get("/sitemap.xml").catch(() => ({ status: 0, headers: {}, html: "" }));
  const sitemap = analyzeSitemap(sm.html, opts.mode, pages, opts.base, new Date());
  const rb = await get("/robots.txt").catch(() => ({ status: 0, headers: {}, html: "" }));
  const robots = analyzeRobots(rb.html, opts.mode, opts.base);
  const all = [...pages.flatMap((p) => p.findings), ...sitemap.findings, ...robots];
  const byCode: Record<string, number> = {};
  for (const f of all) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
  const byKind: Record<string, number> = {};
  for (const p of pages) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  return { mode: opts.mode, base: opts.base, startedAt: started.toISOString(), finishedAt: new Date().toISOString(), pages, sitemap, robots, summary: { urls: pages.length, errors: all.filter((f) => f.severity === "error").length, warnings: all.filter((f) => f.severity === "warning").length, byKind, byCode } };
}
