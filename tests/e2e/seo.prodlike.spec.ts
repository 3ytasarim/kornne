import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { testDatabaseUrl } from "../test-db-url.mjs";
import { canonicalRedirectTarget } from "../../src/lib/i18n/routes";

/**
 * Sprint 8 — OFFLINE production-like preview (localhost:3471, .next-prodlike build, local DB copy):
 * SITE_INDEXABLE + CATALOG_DATA_VERIFIED + SITE_URL=http://localhost:3471, all six languages indexable (2026-11). Nothing is published,
 * no real domain is used, nothing is sent to Google. Read-only: these tests never write.
 */
const BASE = "http://localhost:3471";
async function q<T>(sql: string): Promise<T[]> {
  const c = new pg.Client({ connectionString: testDatabaseUrl("e2e") });
  await c.connect();
  try {
    return (await c.query(sql)).rows as T[];
  } finally {
    await c.end();
  }
}
const ldBlocks = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));

test.describe("prod-like robots / sitemap", () => {
  test("robots.txt allows crawling, keeps admin/search/facets out and points at the own sitemap", async ({ request }) => {
    const txt = await (await request.get(`${BASE}/robots.txt`)).text();
    expect(txt).toMatch(/Allow: \//);
    expect(txt).toMatch(/Disallow: \/admin/);
    expect(txt).toMatch(/Disallow: \/tr\/arama/);
    expect(txt).toMatch(/Disallow: \/search/);
    expect(txt).toContain(`Sitemap: ${BASE}/sitemap.xml`);
    expect(txt).not.toMatch(/^Disallow: \/$/m);
  });

  test("sitemap lists only 200 + indexable + self-canonical URLs with real lastmod and images", async ({ request }) => {
    test.setTimeout(600_000);
    const xml = await (await request.get(`${BASE}/sitemap.xml`)).text();
    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: m[1]!.match(/<loc>([^<]+)<\/loc>/)![1]!, lastmod: m[1]!.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null, images: (m[1]!.match(/<image:loc>/g) ?? []).length }));
    const products = await q<{ n: number }>(`select count(*)::int n from "Product" where status='PUBLISHED' and not "needsReview"`);
    expect(urls.filter((u) => u.loc.includes("/tr/urun/"))).toHaveLength(products[0]!.n);
    expect(urls.filter((u) => new URL(u.loc).pathname.startsWith("/product/"))).toHaveLength(products[0]!.n); // English, unprefixed
    expect(urls.filter((u) => u.loc.includes("/de/produkt/"))).toHaveLength(products[0]!.n);
    expect(urls.every((u) => u.loc.startsWith(`${BASE}/`))).toBe(true);
    // admin, search, cart, checkout, quote list never appear
    expect(urls.filter((u) => /\/(admin|arama|sepetim|odeme|teklif-listem|iletisim)(\/|$|\?)/.test(u.loc))).toEqual([]);
    // every language home is listed; no "/en" prefix (English is unprefixed since 2026-11)
    for (const home of ["/", "/tr", "/de", "/fr", "/ru", "/ar"]) expect(urls.some((u) => new URL(u.loc).pathname === home), home).toBe(true);
    expect(urls.filter((u) => /^\/en(\/|$)/.test(new URL(u.loc).pathname))).toEqual([]);
    expect(urls.reduce((a, u) => a + u.images, 0)).toBeGreaterThan(40);
    const now = Date.now();
    for (const u of urls) {
      if (u.lastmod) expect(Math.abs(now - Date.parse(u.lastmod))).toBeGreaterThan(60_000); // a real date, not "now"
      const res = await request.get(u.loc, { maxRedirects: 0 });
      expect(res.status(), u.loc).toBe(200);
      const html = await res.text();
      expect(html, u.loc).toMatch(/<meta name="robots" content="index, follow/);
      // Next renders the root canonical without the trailing slash — same URL
      expect(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]?.replace(/\/$/, ""), u.loc).toBe(u.loc.replace(/\/$/, ""));
      expect(res.headers()["x-robots-tag"]).toBeUndefined();
    }
  });
});

test.describe("prod-like page SEO", () => {
  test("product: indexable, self-canonical, Product JSON-LD WITHOUT offers/ratings, hreflang to all six languages", async ({ request }) => {
    const [p] = await q<{ slug: string }>(`select t.slug from "ProductTranslation" t join "Product" p on p.id=t."productId" where p.status='PUBLISHED' and not p."needsReview" and t.locale='tr' order by p."sortOrder" limit 1`);
    const html = await (await request.get(`${BASE}/tr/urun/${p!.slug}`)).text();
    expect(html).toContain(`<link rel="canonical" href="${BASE}/tr/urun/${p!.slug}"/>`);
    const langs = [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)"/gi)].map((m) => m[1]).sort();
    expect(langs).toEqual(["ar", "de", "en", "fr", "ru", "tr", "x-default"]);
    const ld = ldBlocks(html);
    const product = ld.find((d) => d["@type"] === "Product");
    expect(product).toBeTruthy();
    expect(JSON.stringify(ld)).not.toMatch(/"offers"|AggregateRating|"review"|"price"/);
    expect(ld.map((d) => d["@type"])).toEqual(expect.arrayContaining(["Organization", "WebSite", "BreadcrumbList", "Product"]));
    // Organization: no unverified legal name
    expect(ld.find((d) => d["@type"] === "Organization")).not.toHaveProperty("legalName");
  });

  test("category: CollectionPage + ItemList of visible products; approved EN version indexable with hreflang", async ({ request }) => {
    const tr = await (await request.get(`${BASE}/tr/kategori/mezbaha-ekipmanlari`)).text();
    const coll = ldBlocks(tr).find((d) => d["@type"] === "CollectionPage");
    expect(coll?.mainEntity?.itemListElement?.length).toBeGreaterThan(0);
    expect(JSON.stringify(coll)).not.toMatch(/price|offer|rating/i);
    expect(tr).toMatch(/<meta name="robots" content="index, follow/);
    const [en] = await q<{ slug: string }>(`select t.slug from "CategoryTranslation" t join "Category" c on c.id=t."categoryId" where c.key='mezbaha-ekipmanlari' and t.locale='en'`);
    const enHtml = await (await request.get(`${BASE}/category/${en!.slug}`)).text();
    expect(enHtml).toMatch(/<meta name="robots" content="index, follow/);
    expect(enHtml).toMatch(/<link rel="alternate" hrefLang="de"/i);
    // filtered listing canonicalises to the base listing
    const filtered = await (await request.get(`${BASE}/tr/kategori/mezbaha-ekipmanlari?siralama=ad-artan`)).text();
    expect(filtered).toContain(`<link rel="canonical" href="${BASE}/tr/kategori/mezbaha-ekipmanlari"/>`);
  });

  test("utility pages stay noindex in production too (search, cart, checkout, quote list, contact)", async ({ request }) => {
    for (const path of ["/tr/arama?q=kesim", "/tr/sepetim", "/tr/odeme", "/tr/teklif-listem", "/tr/iletisim"]) {
      const html = await (await request.get(`${BASE}${path}`)).text();
      expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }
  });

  test("a Turkish slug under another language is a real 404 (each language has its own slugs)", async ({ request }) => {
    const [p] = await q<{ slug: string }>(`select t.slug from "ProductTranslation" t join "Product" p on p.id=t."productId" where p.status='PUBLISHED' and not p."needsReview" and t.locale='tr' limit 1`);
    for (const path of [`/product/${p!.slug}`, `/ru/produkt/${p!.slug}`, `/de/produkt/${p!.slug}`]) expect((await request.get(`${BASE}${path}`, { maxRedirects: 0 })).status(), path).toBe(404);
  });
});

test.describe("redirects and images (unchanged)", () => {
  test("all 125 legacy redirects: one 301 hop to a 200 page; #208 stays a temporary 307", async ({ request }) => {
    test.setTimeout(180_000);
    const rows = await q<{ fromPath: string; toPath: string; statusCode: number }>(`select "fromPath","toPath","statusCode" from "Redirect" where active and source='LEGACY_AUDIT' order by "fromPath"`);
    expect(rows).toHaveLength(125);
    for (const r of rows) {
      const res = await request.get(`${BASE}${encodeURI(r.fromPath)}`, { maxRedirects: 0 });
      expect(res.status(), r.fromPath).toBe(301);
      const loc = new URL(res.headers().location!, BASE);
      // targets were stored for the pre-2026-11 scheme; the proxy serves today's URL in the same single hop
      expect(decodeURIComponent(loc.pathname), r.fromPath).toBe(canonicalRedirectTarget(r.toPath).split("?")[0]);
      const hop = await request.get(loc.toString(), { maxRedirects: 0 });
      expect(hop.status(), `${r.fromPath} → ${r.toPath}`).toBe(200);
    }
    const [held] = await q<{ slug: string }>(`select t.slug from "ProductTranslation" t join "Product" p on p.id=t."productId" where p."sourceKey"='kornne.com:208' and t.locale='tr'`);
    const res = await request.get(`${BASE}/tr/urun/${held!.slug}`, { maxRedirects: 0 });
    expect(res.status()).toBe(307);
  });

  test("445 images served at their legacy paths byte-identical to the recorded SHA-256; the 6 broken stay 404", async ({ request }) => {
    test.setTimeout(240_000);
    const rows = await q<{ publicPath: string; sha256: string; mime: string }>(`select "publicPath", sha256, mime from "MediaAsset" where origin='legacy_import'`);
    expect(rows).toHaveLength(445);
    let ok = 0;
    const mislabeled: string[] = [];
    for (const r of rows) {
      const path = `/upload/${r.publicPath.replace(/^\/?upload\//, "").split("/").map(encodeURIComponent).join("/")}`;
      const res = await request.get(`${BASE}${path}`);
      expect(res.status(), path).toBe(200);
      // Content-Type follows the legacy file extension; known exception: 1 orphan PNG saved as .jpeg on kornne.com
      const byExt = /\.png$/i.test(path) ? "image/png" : /\.jpe?g$/i.test(path) ? "image/jpeg" : r.mime;
      expect(res.headers()["content-type"], path).toContain(byExt);
      if (byExt !== r.mime) mislabeled.push(path);
      if (createHash("sha256").update(await res.body()).digest("hex") === r.sha256) ok++;
    }
    expect(ok).toBe(445);
    expect(mislabeled).toEqual(["/upload/1644837286-620a39a65e3f2.jpeg"]);
    for (const f of ["belge1.jpg", "belge2.jpg", "belge3.jpg", "belge4.jpg", "belge5.jpg", "Kornne-Klasik-Kesim-Hucre-61.jpg"]) expect((await request.get(`${BASE}/upload/${f}`)).status(), f).toBe(404);
  });
});
