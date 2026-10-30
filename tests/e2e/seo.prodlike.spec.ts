import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import pg from "pg";
import { testDatabaseUrl } from "../test-db-url.mjs";

/**
 * Sprint 8 — OFFLINE production-like preview (localhost:3471, .next-prodlike build, local DB copy):
 * SITE_INDEXABLE + CATALOG_DATA_VERIFIED + SITE_URL=http://localhost:3471, SEO_LOCALES=tr. Nothing is published,
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
    expect(txt).toMatch(/Disallow: \/arama/);
    expect(txt).toContain(`Sitemap: ${BASE}/sitemap.xml`);
    expect(txt).not.toMatch(/^Disallow: \/$/m);
  });

  test("sitemap lists only 200 + indexable + self-canonical URLs with real lastmod and images", async ({ request }) => {
    test.setTimeout(120_000);
    const xml = await (await request.get(`${BASE}/sitemap.xml`)).text();
    const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: m[1]!.match(/<loc>([^<]+)<\/loc>/)![1]!, lastmod: m[1]!.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null, images: (m[1]!.match(/<image:loc>/g) ?? []).length }));
    const products = await q<{ n: number }>(`select count(*)::int n from "Product" where status='PUBLISHED' and not "needsReview"`);
    expect(urls.filter((u) => u.loc.includes("/urun/"))).toHaveLength(products[0]!.n);
    expect(urls.every((u) => u.loc.startsWith(`${BASE}/`))).toBe(true);
    // admin, search, cart, checkout, quote list never appear
    expect(urls.filter((u) => /\/(admin|arama|sepetim|odeme|teklif-listem|iletisim)(\/|$|\?)/.test(u.loc))).toEqual([]);
    // SEO_LOCALES=tr → no unapproved language in the sitemap
    expect(urls.filter((u) => /^\/(en|fr|ru|ar)(\/|$)/.test(new URL(u.loc).pathname))).toEqual([]);
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
  test("product: indexable, self-canonical, Product JSON-LD WITHOUT offers/ratings, no hreflang to missing translations", async ({ request }) => {
    const [p] = await q<{ slug: string }>(`select t.slug from "ProductTranslation" t join "Product" p on p.id=t."productId" where p.status='PUBLISHED' and not p."needsReview" and t.locale='tr' order by p."sortOrder" limit 1`);
    const html = await (await request.get(`${BASE}/urun/${p!.slug}`)).text();
    expect(html).toContain(`<link rel="canonical" href="${BASE}/urun/${p!.slug}"/>`);
    expect(html).not.toMatch(/<link rel="alternate" hrefLang=/i);
    const ld = ldBlocks(html);
    const product = ld.find((d) => d["@type"] === "Product");
    expect(product).toBeTruthy();
    expect(JSON.stringify(ld)).not.toMatch(/"offers"|AggregateRating|"review"|"price"/);
    expect(ld.map((d) => d["@type"])).toEqual(expect.arrayContaining(["Organization", "WebSite", "BreadcrumbList", "Product"]));
    // Organization: no unverified legal name
    expect(ld.find((d) => d["@type"] === "Organization")).not.toHaveProperty("legalName");
  });

  test("category: CollectionPage + ItemList of visible products; unapproved EN name → noindex, no hreflang", async ({ request }) => {
    const tr = await (await request.get(`${BASE}/kategori/mezbaha-ekipmanlari`)).text();
    const coll = ldBlocks(tr).find((d) => d["@type"] === "CollectionPage");
    expect(coll?.mainEntity?.itemListElement?.length).toBeGreaterThan(0);
    expect(JSON.stringify(coll)).not.toMatch(/price|offer|rating/i);
    expect(tr).toMatch(/<meta name="robots" content="index, follow/);
    const [en] = await q<{ slug: string }>(`select t.slug from "CategoryTranslation" t join "Category" c on c.id=t."categoryId" where c.key='mezbaha-ekipmanlari' and t.locale='en'`);
    const enHtml = await (await request.get(`${BASE}/en/category/${en!.slug}`)).text();
    expect(enHtml).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(enHtml).not.toMatch(/<link rel="alternate" hrefLang=/i);
    // filtered listing canonicalises to the base listing
    const filtered = await (await request.get(`${BASE}/kategori/mezbaha-ekipmanlari?siralama=ad-artan`)).text();
    expect(filtered).toContain(`<link rel="canonical" href="${BASE}/kategori/mezbaha-ekipmanlari"/>`);
  });

  test("utility pages stay noindex in production too (search, cart, checkout, quote list, contact)", async ({ request }) => {
    for (const path of ["/arama?q=kesim", "/sepetim", "/odeme", "/teklif-listem", "/iletisim"]) {
      const html = await (await request.get(`${BASE}${path}`)).text();
      expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }
  });

  test("an untranslated product URL in another language is a real 404 (no fake RU/AR page)", async ({ request }) => {
    const [p] = await q<{ slug: string }>(`select t.slug from "ProductTranslation" t join "Product" p on p.id=t."productId" where p.status='PUBLISHED' and not p."needsReview" limit 1`);
    for (const path of [`/en/product/${p!.slug}`, `/ru/produkt/${p!.slug}`, `/ar/product/${p!.slug}`]) expect((await request.get(`${BASE}${path}`, { maxRedirects: 0 })).status(), path).toBe(404);
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
      expect(decodeURIComponent(loc.pathname), r.fromPath).toBe(r.toPath.split("?")[0]);
      const hop = await request.get(loc.toString(), { maxRedirects: 0 });
      expect(hop.status(), `${r.fromPath} → ${r.toPath}`).toBe(200);
    }
    const [held] = await q<{ slug: string }>(`select t.slug from "ProductTranslation" t join "Product" p on p.id=t."productId" where p."sourceKey"='kornne.com:208' and t.locale='tr'`);
    const res = await request.get(`${BASE}/urun/${held!.slug}`, { maxRedirects: 0 });
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
