import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { auditBaseFor, auditCsv, compact } from "@/lib/admin/seo-audit";
import { analyzePage, analyzeRobots, analyzeSitemap, crossCheck, parseHtml, runSeoAudit, type PageExpect } from "@/lib/seo/audit";
import { geoSuggestions } from "@/lib/seo/geo";
import { analyzeImages, brokenFromInventory, sniffMime, type ImageRow } from "@/lib/seo/image-audit";
import { breadcrumbJsonLd, collectionPageJsonLd, productJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { buildMetadata, clampDescription } from "@/lib/seo/metadata";
import { seoLocales } from "@/lib/seo/site";

const BASE = "http://localhost:3471";
const html = (head: string, body = "<h1>T</h1>", lang = "tr", dir = "ltr") => `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><head>${head}</head><body>${body}</body></html>`;
const head = (o: { robots?: string; canonical?: string; alt?: Record<string, string>; title?: string; ld?: unknown[] } = {}) =>
  [
    `<title>${o.title ?? "Ayak ve Boynuz Testeresi | KORNNE"}</title>`,
    `<meta name="description" content="Gerçek açıklama metni burada yer alır ve yeterince uzundur."/>`,
    o.robots ? `<meta name="robots" content="${o.robots}"/>` : "",
    o.canonical ? `<link rel="canonical" href="${o.canonical}"/>` : "",
    ...Object.entries(o.alt ?? {}).map(([l, h]) => `<link rel="alternate" hrefLang="${l}" href="${h}"/>`),
    `<meta property="og:title" content="x"/><meta property="og:image" content="${BASE}/a.jpg"/><meta name="twitter:card" content="summary_large_image"/>`,
    ...(o.ld ?? []).map((d) => `<script type="application/ld+json">${serializeJsonLd(d)}</script>`),
  ].join("");
const exp = (e: Partial<PageExpect> = {}): PageExpect => ({ path: "/urun/x", kind: "product", status: 200, indexable: true, lang: "tr", dir: "ltr", ...e });
const H = { "content-type": "text/html; charset=utf-8" };

describe("SEO audit — page analysis", () => {
  it("flags any indexable page in the dev (noindex) environment", () => {
    const r = analyzePage({ expect: exp(), status: 200, headers: H, html: html(head({ robots: "index, follow", canonical: `${BASE}/urun/x` })), base: BASE, mode: "dev" });
    expect(r.findings.map((f) => f.code)).toContain("noindex-leak");
    const ok = analyzePage({ expect: exp(), status: 200, headers: { ...H, "x-robots-tag": "noindex, nofollow" }, html: html(head({ robots: "noindex, nofollow", canonical: `${BASE}/urun/x` })), base: BASE, mode: "dev" });
    expect(ok.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("checks canonical target, origin, lang/dir and expected indexability in prodlike mode", () => {
    const r = analyzePage({ expect: exp({ lang: "ar", dir: "rtl" }), status: 200, headers: H, html: html(head({ robots: "noindex", canonical: "https://kornne.com/urun/y" })), base: BASE, mode: "prodlike" });
    const codes = r.findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["unexpected-noindex", "canonical-origin", "canonical-target", "lang", "dir"]));
    const filter = analyzePage({ expect: exp({ path: "/kategori/a?siralama=ad", kind: "category-filter", canonicalPath: "/kategori/a", indexable: undefined }), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/kategori/a` })), base: BASE, mode: "prodlike" });
    expect(filter.findings.filter((f) => f.code.startsWith("canonical"))).toEqual([]);
  });

  it("rejects Offer / AggregateRating / Review JSON-LD (no verified price or reviews exist)", () => {
    const offer = productJsonLd({ name: "X", description: "d", path: "/urun/x", images: [], locale: "tr", offer: { priceMinor: 100n, currency: "TRY", availability: "InStock" } });
    const r = analyzePage({ expect: exp(), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/urun/x`, ld: [offer, { "@type": "Product", aggregateRating: { "@type": "AggregateRating", ratingValue: 5 } }] })), base: BASE, mode: "prodlike" });
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["ld-commercial", "ld-forbidden"]));
    const clean = productJsonLd({ name: "X", description: "d", path: "/urun/x", images: [], locale: "tr", offer: null });
    const ok = analyzePage({ expect: exp(), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/urun/x`, ld: [clean, breadcrumbJsonLd([{ name: "a", path: "/" }])] })), base: BASE, mode: "prodlike" });
    expect(ok.findings.filter((f) => f.code.startsWith("ld-"))).toEqual([]);
  });

  it("JSON-LD escaping survives hostile names and is still parseable", () => {
    const ld = collectionPageJsonLd({ name: '</script><img onerror=x> & "q"', path: "/kategori/a", locale: "tr", items: [{ name: "a<b", path: "/urun/a" }] });
    const s = serializeJsonLd(ld);
    expect(s).not.toMatch(/[<>&]/);
    expect(JSON.parse(s).name).toBe('</script><img onerror=x> & "q"');
    expect(JSON.stringify(ld)).not.toMatch(/offers|price|rating/i);
    const p = parseHtml(html(head({ ld: [ld] })));
    expect(p.jsonLdTypes).toEqual(expect.arrayContaining(["CollectionPage", "ItemList", "ListItem"]));
    expect(p.jsonLdInvalid).toBe(0);
  });

  it("hreflang: requires self + x-default and reciprocity; broken alternates are errors", () => {
    const a = analyzePage({ expect: exp({ path: "/sayfa/a" }), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/sayfa/a`, alt: { tr: `${BASE}/sayfa/a`, en: `${BASE}/en/page/b`, "x-default": `${BASE}/sayfa/a` } })), base: BASE, mode: "prodlike" });
    const b = analyzePage({ expect: exp({ path: "/en/page/b", lang: "en" }), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/en/page/b`, alt: { en: `${BASE}/en/page/b` } }), "<h1>T</h1>", "en"), base: BASE, mode: "prodlike" });
    const c = analyzePage({ expect: exp({ path: "/sayfa/c" }), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/sayfa/c`, alt: { en: `${BASE}/en/page/b` } })), base: BASE, mode: "prodlike" });
    crossCheck([a, b, c], BASE);
    expect(a.findings.map((f) => f.code)).toContain("hreflang-reciprocal");
    expect(c.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["hreflang-xdefault", "hreflang-self"]));
    const gone = analyzePage({ expect: exp({ path: "/en/page/b", status: 404 }), status: 404, headers: H, html: "", base: BASE, mode: "prodlike" });
    const d = analyzePage({ expect: exp({ path: "/sayfa/a" }), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/sayfa/a`, alt: { tr: `${BASE}/sayfa/a`, en: `${BASE}/en/page/b`, "x-default": `${BASE}/sayfa/a` } })), base: BASE, mode: "prodlike" });
    crossCheck([d, gone], BASE);
    expect(d.findings.map((f) => f.code)).toContain("hreflang-broken");
  });

  it("duplicate titles count only among self-canonical indexable pages", () => {
    const mk = (path: string, canonical: string) => analyzePage({ expect: exp({ path, indexable: undefined }), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}${canonical}`, title: "Aynı başlık" })), base: BASE, mode: "prodlike" });
    const base = mk("/kategori/a", "/kategori/a");
    const filtered = mk("/kategori/a?siralama=x", "/kategori/a");
    crossCheck([base, filtered], BASE);
    expect(base.findings.map((f) => f.code)).not.toContain("title-duplicate");
    const other = mk("/kategori/b", "/kategori/b");
    crossCheck([base, other], BASE);
    expect(base.findings.map((f) => f.code)).toContain("title-duplicate");
  });
});

describe("SEO audit — robots, sitemap, redirects", () => {
  it("robots: dev must disallow all; prodlike must allow, point at the own sitemap and keep /admin out", () => {
    expect(analyzeRobots("User-Agent: *\nDisallow: /\n", "dev", BASE)).toEqual([]);
    expect(analyzeRobots("User-Agent: *\nAllow: /\n", "dev", BASE).map((f) => f.code)).toContain("robots-dev-open");
    expect(analyzeRobots(`User-Agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${BASE}/sitemap.xml\n`, "prodlike", BASE)).toEqual([]);
    expect(analyzeRobots("User-Agent: *\nDisallow: /\nSitemap: https://kornne.com/sitemap.xml", "prodlike", BASE).map((f) => f.code)).toEqual(expect.arrayContaining(["robots-prod-closed", "robots-sitemap", "robots-admin"]));
  });

  it("sitemap: only 200 + indexable + canonical URLs; a lastmod equal to 'now' is suspicious", () => {
    const ok = analyzePage({ expect: exp({ path: "/urun/x" }), status: 200, headers: H, html: html(head({ robots: "index", canonical: `${BASE}/urun/x` })), base: BASE, mode: "prodlike" });
    const no = analyzePage({ expect: exp({ path: "/arama", kind: "search", indexable: false }), status: 200, headers: H, html: html(head({ robots: "noindex", canonical: `${BASE}/arama` })), base: BASE, mode: "prodlike" });
    const now = new Date("2026-10-22T12:00:00Z");
    const xml = `<urlset><url><loc>${BASE}/urun/x</loc><lastmod>2026-10-20T10:00:00.000Z</lastmod></url><url><loc>${BASE}/arama</loc><lastmod>${now.toISOString()}</lastmod></url></urlset>`;
    const r = analyzeSitemap(xml, "prodlike", [ok, no], BASE, now);
    expect(r.urlCount).toBe(2);
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["sitemap-not-indexable", "sitemap-lastmod-now"]));
    expect(r.findings.filter((f) => f.message.includes("/urun/x"))).toEqual([]);
    expect(analyzeSitemap(xml, "dev", [], BASE, now).findings.map((f) => f.code)).toEqual(["sitemap-dev-not-empty"]);
  });

  it("redirects must land on a 200 page in ONE hop (chains and loops are errors)", async () => {
    const routes: Record<string, { status: number; location?: string }> = { "/lang-eng/": { status: 301, location: "/en" }, "/en": { status: 200 }, "/eski": { status: 301, location: "/ara" }, "/ara": { status: 308, location: "/son" }, "/loop": { status: 301, location: "/loop" } };
    const fetchImpl = (async (url: string) => {
      const u = new URL(url);
      const r = routes[u.pathname] ?? { status: 404 };
      const headers = new Headers(r.location ? { location: r.location } : { "content-type": "text/plain" });
      return new Response(u.pathname.endsWith(".xml") ? "<urlset></urlset>" : u.pathname.endsWith(".txt") ? "User-Agent: *\nDisallow: /" : "", { status: r.status, headers });
    }) as unknown as typeof fetch;
    const rep = await runSeoAudit({ base: BASE, mode: "dev", fetchImpl, inventory: [
      { path: "/lang-eng/", kind: "legacy-redirect", status: 301, location: "/en" },
      { path: "/eski", kind: "legacy-redirect", status: 301, location: "/ara" },
      { path: "/loop", kind: "legacy-redirect", status: 301, location: "/loop" },
    ] });
    const by = Object.fromEntries(rep.pages.map((p) => [p.path, p.findings.map((f) => f.code)]));
    expect(by["/lang-eng/"]).toEqual([]);
    expect(by["/eski"]).toContain("redirect-chain");
    expect(by["/loop"]).toContain("redirect-chain");
  });
});

describe("SEO language policy (buildMetadata)", () => {
  const prev = { ...process.env };
  afterEach(() => {
    for (const k of ["SITE_INDEXABLE", "SEO_LOCALES"]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("default: only Turkish is indexable; no hreflang towards unapproved languages", () => {
    process.env.SITE_INDEXABLE = "true";
    delete process.env.SEO_LOCALES;
    expect(seoLocales()).toEqual(["tr"]);
    const tr = buildMetadata({ title: "t", description: "d", path: "/", locale: "tr" });
    const en = buildMetadata({ title: "t", description: "d", path: "/", locale: "en" });
    expect(tr.robots).toMatchObject({ index: true });
    expect(en.robots).toMatchObject({ index: false });
    expect(tr.alternates?.languages).toBeUndefined();
  });

  it("with approved languages: reciprocal hreflang + x-default (Turkish) only between them", () => {
    process.env.SITE_INDEXABLE = "true";
    process.env.SEO_LOCALES = "tr,en";
    const m = buildMetadata({ title: "t", description: "d", path: "/sss", locale: "en" });
    expect(Object.keys(m.alternates?.languages ?? {}).sort()).toEqual(["en", "tr", "x-default"]);
    expect(String((m.alternates?.languages as Record<string, string>)["x-default"])).toMatch(/\/sss$/);
    expect(m.robots).toMatchObject({ index: true });
  });

  it("never indexable outside production, and descriptions are clamped to 160 characters", () => {
    delete process.env.SITE_INDEXABLE;
    expect(buildMetadata({ title: "t", description: "d", path: "/", locale: "tr" }).robots).toMatchObject({ index: false });
    const long = "Kelime ".repeat(60);
    const c = clampDescription(long);
    expect(c.length).toBeLessThanOrEqual(160);
    expect(c.endsWith("…")).toBe(true);
  });
});

describe("image audit", () => {
  const row = (o: Partial<ImageRow>): ImageRow => ({ id: "m", publicPath: "/upload/Kornne-urun-1.jpg", storageKey: "originals/Kornne-urun-1.jpg", sha256: "a", mime: "image/jpeg", bytes: 1000, width: 1600, height: 1600, origin: "legacy_import", alts: [{ locale: "tr", alt: "Ürün", autoGenerated: true }], usages: [{ productId: "p", productRef: "80", productTitle: "Ürün", public: true, isMain: true }], bannerCount: 0, ...o });

  it("classifies Merchant thresholds (100 now / 500 from 31 Jan 2027 / 1500 recommended) with reasons", () => {
    const { items, summary } = analyzeImages([row({ id: "a", width: 225, height: 225 }), row({ id: "b", publicPath: "/upload/b.jpg", width: 1000, height: 1000, sha256: "b" }), row({ id: "c", publicPath: "/upload/c.jpg", width: 90, height: 90, sha256: "c" })]);
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(by.a!.merchant).toBe("BELOW_2027");
    expect(by.a!.issues.map((x) => x.code)).toContain("merchant-main-below-500");
    expect(by.b!.merchant).toBe("OK");
    expect(by.b!.issues.map((x) => x.code)).toContain("below-recommended");
    expect(by.c!.merchant).toBe("BELOW_NOW");
    expect(summary.mainBelow500).toBe(2);
  });

  it("auto-generated alt text is not counted as written; duplicates, suspect names and banners are flagged", () => {
    const { items } = analyzeImages([row({ id: "a", publicPath: "/upload/WhatsApp Görsel 2024.jpg" }), row({ id: "b", publicPath: "/upload/x.jpg", width: 1150, height: 250 }), row({ id: "c", publicPath: "/upload/y.jpg", usages: [], sha256: "zz" })]);
    const codes = Object.fromEntries(items.map((i) => [i.id, i.issues.map((x) => x.code)]));
    expect(codes.a).toEqual(expect.arrayContaining(["alt-missing", "filename-suspect", "duplicate"]));
    expect(codes.b).toEqual(expect.arrayContaining(["aspect", "duplicate"]));
    expect(codes.c).toEqual(["orphan"]);
  });

  it("sniffs the real format from magic bytes", () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffMime(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBe("image/svg+xml");
  });

  it("reports exactly the 6 images that were already 404 on kornne.com (not hidden, not faked)", () => {
    const broken = brokenFromInventory(readFileSync("docs/audit/media-inventory.csv", "utf8"));
    expect(broken).toHaveLength(6);
    expect(broken.map((b) => b.url.split("/").pop()).sort()).toEqual(["Kornne-Klasik-Kesim-Hucre-61.jpg", "belge1.jpg", "belge2.jpg", "belge3.jpg", "belge4.jpg", "belge5.jpg"]);
    expect(broken.every((b) => b.status === "404")).toBe(true);
  });
});

describe("GEO advisor (suggestions only)", () => {
  it("derives suggestions from the real text with evidence and never returns generated content", () => {
    const s = geoSuggestions({ title: "Ayak ve Boynuz Testeresi", descriptionText: "TEKNİK ÖZELLİKLER • Güç Kaynağı : Elektro Hidrolik olacaktır.", descriptionHtml: "<p>• Güç Kaynağı : Elektro Hidrolik olacaktır.</p><p>• Güç Kapasitesi : Min.180 bar olacaktır.</p><p>• Bıçak Açıklığı : 150 mm</p>", seoDescription: null, verifiedSpecs: 0, faqCount: 0, images: 3, imageAltsByEditor: 0 });
    const codes = s.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(["thin", "unstructured-specs", "tender-language", "no-faq", "no-meta", "alt-auto"]));
    expect(s.every((x) => x.evidence.length > 0)).toBe(true);
  });
});

describe("Admin SEO QA", () => {
  it("audits only this application (SSRF-safe target)", () => {
    expect(auditBaseFor("localhost:3470")).toBe("http://127.0.0.1:3470");
    expect(auditBaseFor("evil.example:80", "https://kornne.com")).toBe("https://kornne.com");
    expect(() => auditBaseFor("169.254.169.254", "")).toThrow();
    expect(() => auditBaseFor(null, "javascript:alert(1)")).toThrow();
  });

  it("CSV export has URLs and findings only and neutralises formulas", () => {
    const page = analyzePage({ expect: exp({ path: "/urun/=cmd" }), status: 200, headers: H, html: html(head({ robots: "noindex", canonical: `${BASE}/urun/=cmd`, title: "=HYPERLINK(1)" })), base: BASE, mode: "prodlike" });
    const csv = auditCsv(compact({ mode: "prodlike", base: BASE, startedAt: "", finishedAt: "", pages: [page], sitemap: { urlCount: 0, imageCount: 0, findings: [], urls: [] }, robots: [], summary: { urls: 1, errors: 0, warnings: 0, byKind: {}, byCode: {} } }));
    expect(csv.split("\r\n")[0]).toContain("URL");
    expect(csv).not.toMatch(/@kornne|\+90|e-posta/i);
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });
});
