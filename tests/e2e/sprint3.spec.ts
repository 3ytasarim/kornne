import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseCsv } from "../../scripts/import/lib/sources";
import { cleanupE2eWrites } from "./cleanup";
import { confirmSubmit, login } from "./helpers";
import { readTestAdmin } from "./test-admin";
import { testDatabaseUrl } from "../test-db-url.mjs";

const redirects = JSON.parse(readFileSync("src/data/redirects.json", "utf8")) as Record<string, string>;
const media = parseCsv(readFileSync("docs/audit/media-inventory.csv", "utf8"));
const pathOf = (u: string) => new URL(u, "http://x").pathname;

// Sprint 12: the 41 legacy prices were approved on the client's instruction (local copy) → KDV dahil prices are shown
test.describe("verified prices: shown with VAT, no Offer markup (stock unknown), no strike-through", () => {
  test("product page: price + VAT + cart CTA, no Offer, no rating", async ({ page }) => {
    await page.goto("/urun/dairesel-kesim-hucresi");
    await expect(page.locator('[data-price-status="verified"]')).toContainText("1.807.479,94 TL");
    await expect(page.locator('[data-price-status="verified"]')).toContainText("KDV dahil");
    await expect(page.getByRole("button", { name: "Sepete ekle", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me\/905354068002\?text=/);
    await expect(page.getByRole("main").getByRole("link", { name: "E-posta", exact: true })).toHaveAttribute("href", /^mailto:info@kornne\.com\?subject=/);
    expect(await page.locator("main s").count()).toBe(0); // no old / strike-through price
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = ld.map((s) => JSON.parse(s)).find((j) => j["@type"] === "Product");
    expect(product).toBeTruthy();
    expect(product.offers).toBeUndefined();
    expect(JSON.stringify(ld)).not.toMatch(/aggregateRating|"review"/i);
  });

  test("listing cards show the KDV dahil price and a cart button", async ({ page }) => {
    await page.goto("/kategori/tum-urunler");
    await expect(page.getByRole("main").getByText("40 ürün", { exact: false }).first()).toBeVisible();
    await expect(page.locator("main article").first()).toContainText(/\d,\d{2} TL/);
    await expect(page.locator("main article").first()).toContainText("KDV dahil");
    expect(await page.locator("main article").count()).toBe(24);
    expect(await page.getByRole("main").getByText("Fiyat için teklif alın").count()).toBe(0);
  });
});

test.describe("visibility", () => {
  test("#208 is held for review: temporary redirect, absent from listings and search", async ({ page, request }) => {
    const res = await request.get("/urun/ikizray-kurban-kancasi", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(pathOf(res.headers().location!)).toBe("/kategori/kurban-ekipmanlari");
    await page.goto("/kategori/kurban-ekipmanlari");
    await expect(page.getByRole("main").getByText("15 ürün", { exact: false }).first()).toBeVisible();
    await expect(page.locator('main a[href="/urun/ikizray-kurban-kancasi"]')).toHaveCount(0);
    await page.goto("/arama?q=ikizray");
    await expect(page.locator('main a[href="/urun/ikizray-kurban-kancasi"]')).toHaveCount(0);
  });

  test("category counts are computed from public records", async ({ page }) => {
    await page.goto("/kategori/mezbaha-ekipmanlari");
    const nav = page.getByRole("navigation", { name: "Kategoriler" }).first();
    await expect(nav.getByRole("link", { name: /Mezbaha Ekipmanları\s*37/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Kurban Ekipmanları\s*15/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Robotik Sistemler\s*26/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Tüm Ürünler\s*40/ })).toBeVisible();
  });
});

test.describe("listing: pagination, filter, sort", () => {
  test("legacy-compatible pagination", async ({ page, request }) => {
    await page.goto("/kategori/tum-urunler/2");
    expect(await page.locator("main article").count()).toBe(16);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/kategori\/tum-urunler\/2$/);
    expect((await request.get("/kategori/tum-urunler/3", { maxRedirects: 0 })).status()).toBe(301);
  });

  test("category filter + name sort + clear", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/kategori/tum-urunler");
    await page.getByLabel("Kategori", { exact: true }).selectOption("kurban-ekipmanlari");
    await expect(page).toHaveURL(/kategori=kurban-ekipmanlari/);
    await expect(page.getByRole("status").filter({ hasText: "15 ürün" })).toBeVisible();
    await page.getByLabel("Sırala", { exact: true }).selectOption("ad-artan");
    await expect(page).toHaveURL(/siralama=ad-artan/);
    const titles = await page.locator("main article h2").allTextContents();
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "tr")));
    // canonical never follows the filter
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/kategori\/tum-urunler$/);
    await page.getByRole("button", { name: "Filtreleri temizle" }).click();
    await expect(page).toHaveURL(/\/kategori\/tum-urunler$/);
  });

  test("in-list text filter with empty state", async ({ page }) => {
    await page.goto("/kategori/tum-urunler");
    const input = page.getByLabel("Bu listede ara");
    await input.fill("sterilizatör");
    await input.press("Enter");
    await expect(page).toHaveURL(/q=steriliza/);
    expect(await page.locator("main article").count()).toBeGreaterThanOrEqual(3);
    await input.fill("qqqqq");
    await input.press("Enter");
    await expect(page.getByText("Seçilen filtrelerle eşleşen ürün yok.")).toBeVisible();
  });
});

test.describe("search", () => {
  test("results, accent-insensitive", async ({ page }) => {
    await page.goto("/arama?q=dos acma");
    await expect(page.locator('main a[href="/urun/dos-acma-testeresi"]').first()).toBeVisible();
  });
  test("empty result offers categories and featured products", async ({ page }) => {
    await page.goto("/arama?q=xyzxyz");
    await expect(page.getByText("“xyzxyz” için sonuç bulunamadı.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Kategorilere göz atın" })).toBeVisible();
    expect(await page.locator("main article").count()).toBe(4);
  });
  test("too short query", async ({ page }) => {
    await page.goto("/arama?q=a");
    await expect(page.getByText("En az 2 karakter yazın.")).toBeVisible();
  });
});

test("all 125 legacy redirects: single hop to a live page", async ({ request }) => {
  const entries = Object.entries(redirects);
  expect(entries).toHaveLength(125);
  for (const [from, to] of entries) {
    const res = await request.get(encodeURI(from), { maxRedirects: 0 });
    expect(res.status(), from).toBe(301);
    expect(decodeURI(pathOf(res.headers().location!)), from).toBe(to);
    const final = await request.get(encodeURI(to), { maxRedirects: 0 });
    expect(final.status(), `${from} → ${to}`).toBe(200);
  }
});

test("legacy /upload URLs: 445 originals byte-identical, 6 source-broken stay 404", async ({ request }) => {
  let ok = 0;
  for (const m of media) {
    const res = await request.get(new URL(m.url!).pathname);
    if (m.mirror_status === "ok") {
      expect(res.status(), m.url).toBe(200);
      expect(createHash("sha256").update(await res.body()).digest("hex"), m.url).toBe(m.sha256);
      ok++;
    } else expect(res.status(), m.url).toBe(404);
  }
  expect(ok).toBe(445);
});

test("end-to-end: one real product from legacy record to new page", async ({ page, request }) => {
  const catalog = JSON.parse(readFileSync("src/data/source-snapshot/catalog.json", "utf8"));
  const legacy = catalog.products.find((p: { source_id: string }) => p.source_id === "78");
  const en = catalog.translations.find((t: { source_id: string; locale: string }) => t.locale === "en" && t.source_id === "140");
  // same Turkish path as the legacy site
  const oldPath = pathOf(legacy.source_url);
  const res = await page.goto(oldPath);
  expect(res?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.locator("h1")).toHaveText(legacy.title);
  // category relation (breadcrumb) matches the legacy breadcrumb
  await expect(page.getByRole("navigation", { name: "Sayfa konumu" })).toContainText(legacy.category_breadcrumb);
  // first gallery image is the legacy main image, served under the same path, byte-identical
  const main = pathOf(legacy.images[0]);
  const img = await request.get(main);
  const row = media.find((m) => m.url === legacy.images[0])!;
  expect(createHash("sha256").update(await img.body()).digest("hex")).toBe(row.sha256);
  // the separate EN legacy record URL resolves in one hop (to the EN listing until its match is approved)
  const enRes = await request.get(pathOf(en.source_url), { maxRedirects: 0 });
  expect(enRes.status()).toBe(301);
  expect(pathOf(enRes.headers().location!)).toBe("/en/category/all-products");
});

test.afterEach(async () => cleanupE2eWrites());

test("EN match: approve → draft (not public) → publish → live + redirect → unpublish → restored (then reverted)", async ({ page, request }) => {
  test.setTimeout(120_000);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl("e2e") }), transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
  const m = await db.legacyMatchSuggestion.findUniqueOrThrow({ where: { sourceLocale_sourceLegacyId: { sourceLocale: "en", sourceLegacyId: "140" } } });
  expect(m.status).toBe("SUGGESTED");
  const redirectBefore = await db.redirect.findUniqueOrThrow({ where: { fromPath: "/urun/circular-cutting-cell" } });
  try {
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    // Catalog QA links to the comparison screen (no one-click approval any more)
    await page.goto("/admin/catalog-qa");
    await page.getByRole("link", { name: "İncele: EN #140" }).click();
    await expect(page.getByRole("heading", { name: /EN #140/ })).toBeVisible();
    const approve = page.getByRole("form", { name: "Eşleşmeyi onayla" });
    await confirmSubmit(page, approve.getByRole("button", { name: "Onayla", exact: true }), "Onayla — taslak oluştur");
    // the screen re-renders as the decision card
    await expect(page.getByRole("heading", { name: "Karar" })).toBeVisible();
    await expect(page.getByText("Taslak oluşturuldu.")).toBeVisible();
    // approval alone publishes nothing: no EN page, legacy URL unchanged
    expect((await request.get("/en/product/circular-cutting-cell", { maxRedirects: 0 })).status(), "EN page after approval only").toBe(404);
    expect(pathOf((await request.get("/urun/circular-cutting-cell", { maxRedirects: 0 })).headers().location!)).toBe(redirectBefore.toPath);
    // publish the EN version (separate, permissioned step)
    await page.goto(`/admin/products/${m.productId}?tab=diller`);
    await page.getByRole("button", { name: "Bu dili yayınla" }).click();
    // the EN card flips to its published state (the publish form is replaced by the unpublish form)
    await expect(page.getByRole("button", { name: "Yayından kaldır" })).toBeVisible();
    const res = await request.get("/en/product/circular-cutting-cell");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Circular Cutting Cell");
    expect(html).toMatch(/hrefLang="en"|hreflang="en"/);
    expect(pathOf((await request.get("/urun/circular-cutting-cell", { maxRedirects: 0 })).headers().location!)).toBe("/en/product/circular-cutting-cell");
    // unpublish → legacy URL back to its previous target, EN page gone
    await confirmSubmit(page, page.getByRole("button", { name: "Yayından kaldır" }));
    await expect(page.getByRole("button", { name: "Bu dili yayınla" })).toBeVisible();
    expect((await request.get("/en/product/circular-cutting-cell", { maxRedirects: 0 })).status(), "EN page after unpublish").toBe(404);
    expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: "/urun/circular-cutting-cell" } })).toPath, "DB redirect after unpublish").toBe(redirectBefore.toPath);
    expect(pathOf((await request.get("/urun/circular-cutting-cell", { maxRedirects: 0 })).headers().location!)).toBe(redirectBefore.toPath);
  } finally {
    // revert exactly what approve / publish / unpublish did
    await db.$transaction(async (tx) => {
      const tr = await tx.productTranslation.findFirst({ where: { productId: m.productId, locale: "en" } });
      if (tr) await tx.productTranslation.delete({ where: { id: tr.id } });
      const mids = (await tx.productMedia.findMany({ where: { productId: m.productId }, select: { mediaId: true } })).map((x) => x.mediaId);
      await tx.mediaTranslation.deleteMany({ where: { mediaId: { in: mids }, locale: "en", autoGenerated: true } });
      await tx.redirect.update({ where: { fromPath: "/urun/circular-cutting-cell" }, data: { toPath: redirectBefore.toPath, note: redirectBefore.note } });
      await tx.legacySourceRecord.update({ where: { entityType_legacyId_locale: { entityType: "product", legacyId: "140", locale: "en" } }, data: { targetId: null, migrationStatus: "match_suggested" } });
      await tx.legacyMatchSuggestion.update({ where: { id: m.id }, data: { status: "SUGGESTED", decidedById: null, decidedAt: null, note: null, previousRedirectTo: null } });
      await tx.auditLog.deleteMany({ where: { OR: [{ entityId: m.id }, { entityType: "Product", entityId: m.productId, action: { startsWith: "translation." } }] } });
    });
    await db.$disconnect();
  }
});
