import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import pg from "pg";
import { cleanupE2eWrites } from "./cleanup";
import { login } from "./helpers";
import { createTestUser, readTestAdmin, type TestAdmin } from "./test-admin";
import { testDatabaseUrl } from "../test-db-url.mjs";

/**
 * Sprint 8 + 9 acceptance on the isolated noindex server (localhost:3470, local DB copy). Writes are limited to
 * SeoAuditRun / MerchantSyncRun / AuditLog rows of @kornne.test users (removed by cleanupE2eWrites). Nothing is sent
 * to Google: Merchant runs are SIMULATED or MOCK.
 */
const BASE = "http://localhost:3470";
test.afterEach(async () => cleanupE2eWrites());

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: testDatabaseUrl("e2e") });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}
async function as(browser: Browser, user: TestAdmin, viewport?: { width: number; height: number }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: BASE, ...(viewport ? { viewport } : {}) });
  const page = await ctx.newPage();
  await login(page, user.email, user.password);
  return { ctx, page };
}
async function formFields(form: Locator): Promise<Record<string, string>> {
  const entries = await form.evaluate((f: HTMLFormElement) => Array.from(new FormData(f).entries()).filter(([, v]) => typeof v === "string") as [string, string][]);
  return Object.fromEntries(entries);
}
const noOverflow = async (page: Page) => {
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const vw = document.documentElement.clientWidth;
    const culprits = over > 0 ? [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 0.5).slice(-3).map((el) => `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 60)}`) : [];
    return { over, culprits };
  });
  expect(r.over, `${page.url()} ${r.culprits.join(" | ")}`).toBeLessThanOrEqual(0);
};

test.describe("noindex environment (dev / staging)", () => {
  test("robots disallows all, sitemap is empty, pages and images carry X-Robots-Tag noindex", async ({ request }) => {
    expect(await (await request.get(`${BASE}/robots.txt`)).text()).toMatch(/Disallow: \/\s*$/m);
    expect(await (await request.get(`${BASE}/sitemap.xml`)).text()).not.toContain("<url>");
    const home = await request.get(`${BASE}/`);
    expect(home.headers()["x-robots-tag"]).toMatch(/noindex/);
    expect(await home.text()).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    const [img] = await q<{ publicPath: string }>(`select "publicPath" from "MediaAsset" where origin='legacy_import' limit 1`);
    const imgRes = await request.get(`${BASE}/upload/${img!.publicPath.replace(/^\/?upload\//, "").split("/").map(encodeURIComponent).join("/")}`);
    expect(imgRes.headers()["x-robots-tag"]).toMatch(/noindex/);
  });
});

test.describe("Admin › SEO QA", () => {
  test("Super Admin runs the URL audit (keyboard), sees per-URL results and exports a CSV without PII", async ({ browser }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await as(browser, readTestAdmin());
    await page.goto("/admin/seo/qa");
    const run = page.getByRole("button", { name: "Denetimi çalıştır" });
    await run.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Denetim tamamlandı: \d+ URL · 0 hata/)).toBeVisible({ timeout: 180_000 });
    await page.goto("/admin/seo/qa?tur=legacy-redirect");
    await expect(page.getByRole("table", { name: /URL bazlı SEO denetim/ })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Eski URL 301" }).first()).toBeVisible();
    const [last] = await q<{ urlCount: number; errorCount: number; mode: string }>(`select "urlCount","errorCount",mode from "SeoAuditRun" order by "startedAt" desc limit 1`);
    expect(last).toMatchObject({ errorCount: 0, mode: "dev" });
    expect(last!.urlCount).toBeGreaterThan(250);
    const csv = await ctx.request.get("/admin/seo/qa/export");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const body = await csv.text();
    expect(body).toContain("URL;Tür;HTTP");
    expect(body).not.toMatch(/@kornne\.(com|test)|\+90|passwordHash/);
    await ctx.close();
  });

  test("Görsel SEO lists the 6 broken originals and verifies the 445 file hashes; GEO shows suggestions only", async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await as(browser, readTestAdmin());
    await page.goto("/admin/seo/gorseller");
    for (const f of ["belge1.jpg", "belge5.jpg", "Kornne-Klasik-Kesim-Hucre-61.jpg"]) await expect(page.getByText(f, { exact: false }).first()).toBeVisible();
    await expect(page.getByText("9 / 39")).toBeVisible();
    await page.getByRole("button", { name: "445 dosyayı doğrula" }).click();
    await expect(page.getByText(/445 kayıt · 445 dosya: SHA-256 orijinal \+ sunulan kopya birebir aynı/)).toBeVisible({ timeout: 60_000 });
    await page.goto("/admin/seo/geo");
    await expect(page.getByRole("heading", { name: /GEO — yapay zekâ/ })).toBeVisible();
    await expect(page.getByText("Kanıt:").first()).toBeVisible();
    await ctx.close();
  });
});

test.describe("Admin › Merchant Center", () => {
  test("dashboard shows 0/40 READY with reasons and an honest BAĞLI DEĞİL / GÖNDERİLMEDİ status", async ({ browser }) => {
    const { ctx, page } = await as(browser, readTestAdmin());
    await page.goto("/admin/merchant");
    await expect(page.getByText("BAĞLI DEĞİL · GÖNDERİLMEDİ.")).toBeVisible();
    await expect(page.getByText("0 / 40")).toBeVisible();
    await page.goto("/admin/merchant/feed");
    await expect(page.getByText("Hariç tutulan ürünler (40)")).toBeVisible();
    const xml = await ctx.request.get("/admin/merchant/feed/export?format=xml");
    expect(xml.status()).toBe(200);
    const body = await xml.text();
    expect(body).toContain("GÖNDERİLMEDİ");
    expect(body).not.toContain("<item>");
    expect(xml.headers()["x-robots-tag"]).toMatch(/noindex/);
    await ctx.close();
  });

  test("SIMULATED and MOCK runs never reach Google and are recorded; mapping preview writes no mapping", async ({ browser }) => {
    test.setTimeout(120_000);
    const { ctx, page } = await as(browser, readTestAdmin());
    await page.goto("/admin/merchant/baglanti");
    await expect(page.getByText("BAĞLI DEĞİL").first()).toBeVisible();
    await expect(page.getByText("MERCHANT_API_ENABLED açık değil (varsayılan: kapalı)")).toBeVisible();
    await page.getByRole("button", { name: "Simülasyon" }).click();
    await expect(page.getByText(/SİMÜLASYON — GÖNDERİLMEDİ: 0\/40 ürün hazır/)).toBeVisible();
    await page.getByRole("button", { name: "MOCK senkron" }).click();
    await expect(page.getByText(/MOCK — GÖNDERİLMEDİ: 0\/40 ürün hazır/)).toBeVisible();
    const runs = await q<{ mode: string; status: string }>(`select mode, status from "MerchantSyncRun" where mode in ('SIMULATED','MOCK') order by "startedAt" desc limit 2`);
    expect(runs.map((r) => r.status).sort()).toEqual(["MOCK_OK", "NOT_SENT"]);
    const before = (await q<{ n: number }>(`select count(*)::int n from "MerchantItemMapping"`))[0]!.n;
    const [p] = await q<{ slug: string; ref: string }>(`select t.slug, split_part(p."sourceKey", ':', 2) ref from "ProductTranslation" t join "Product" p on p.id=t."productId" where p.status='PUBLISHED' and not p."needsReview" limit 1`);
    await page.goto("/admin/merchant/eslesme");
    await page.locator('input[type="file"]').setInputFiles({ name: "merchant-export.csv", mimeType: "text/csv", buffer: Buffer.from(`id,title,link,language,feed label\nE2E-${p!.ref},A,${BASE}/urun/${p!.slug},tr,TR\nE2E-unknown,B,,tr,TR\n`) });
    await page.getByRole("button", { name: "Önizle" }).click();
    await expect(page.getByText(/Önizleme: 2 satır · 1 eşleşti · 1 eşleşmedi/)).toBeVisible();
    expect((await q<{ n: number }>(`select count(*)::int n from "MerchantItemMapping"`))[0]!.n).toBe(before);
    await ctx.close();
  });
});

test.describe("RBAC — UI and direct requests", () => {
  test("SEO editor: SEO QA yes, Merchant no (screen, feed export, replayed server action)", async ({ browser }) => {
    test.setTimeout(120_000);
    const seo = await createTestUser("SEO_EDITOR");
    const { ctx, page } = await as(browser, seo);
    await page.goto("/admin/seo/qa");
    await expect(page.getByRole("button", { name: "Denetimi çalıştır" })).toBeVisible();
    await page.goto("/admin/merchant");
    await expect(page).toHaveURL(/\/admin\?denied=1$/);
    expect((await ctx.request.get("/admin/merchant/feed/export?format=xml")).status()).toBe(403);
    // replay the admin's Merchant dry-run form (incl. Next's server-action reference) as the SEO editor
    const admin = await as(browser, readTestAdmin());
    await admin.page.goto("/admin/merchant/baglanti");
    const fields = await formFields(admin.page.getByRole("form", { name: "SIMULATED çalıştır" }));
    const before = (await q<{ n: number }>(`select count(*)::int n from "MerchantSyncRun"`))[0]!.n;
    const res = await ctx.request.post(`${BASE}/admin/merchant/baglanti`, { multipart: fields, headers: { origin: BASE }, maxRedirects: 0, failOnStatusCode: false });
    expect(res.status()).toBeLessThan(500);
    expect((await q<{ n: number }>(`select count(*)::int n from "MerchantSyncRun"`))[0]!.n).toBe(before);
    const denied = await q<{ entityId: string }>(`select "entityId" from "AuditLog" where action='auth.denied' and "actorId"=$1`, [seo.id]);
    expect(denied.map((d) => d.entityId)).toEqual(expect.arrayContaining(["merchant.preview", "merchant.simulate"]));
    await admin.ctx.close();
    await ctx.close();
  });

  test("order operator and anonymous users cannot export SEO data", async ({ browser, request }) => {
    const op = await createTestUser("ORDER_OPERATOR");
    const { ctx } = await as(browser, op);
    expect((await ctx.request.get("/admin/seo/qa/export")).status()).toBe(403);
    expect((await request.get(`${BASE}/admin/seo/qa/export`, { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
    expect((await request.get(`${BASE}/admin/merchant/feed/export`, { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
    await ctx.close();
  });
});

test.describe("responsive, languages, RTL", () => {
  for (const width of [320, 768, 1440]) {
    test(`admin SEO / Merchant screens have no horizontal overflow at ${width}px`, async ({ browser }) => {
      test.setTimeout(120_000);
      const { ctx, page } = await as(browser, readTestAdmin(), { width, height: 900 });
      for (const path of ["/admin/seo/qa", "/admin/seo/gorseller", "/admin/seo/geo", "/admin/merchant", "/admin/merchant/feed", "/admin/merchant/eslesme", "/admin/merchant/baglanti"]) {
        await page.goto(path);
        await expect(page.locator("h1")).toBeVisible();
        await noOverflow(page);
      }
      await ctx.close();
    });
  }

  test("storefront TR/EN/FR/RU/AR: lang + dir, one H1, noindex here; Arabic is RTL", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 320, height: 800 } });
    const page = await ctx.newPage();
    for (const [path, lang, dir] of [["/tr", "tr", "ltr"], ["/", "en", "ltr"], ["/de", "de", "ltr"], ["/fr", "fr", "ltr"], ["/ru", "ru", "ltr"], ["/ar", "ar", "rtl"]] as const) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", dir);
      await expect(page.locator("h1")).toHaveCount(1);
      await noOverflow(page);
    }
    await ctx.close();
  });
});

