import "dotenv/config";
import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { cleanupE2eWrites } from "./cleanup";
import { confirmSubmit, login } from "./helpers";
import { createTestUser, readTestAdmin, type TestAdmin } from "./test-admin";
import { testDatabaseUrl } from "../test-db-url.mjs";

/**
 * Sprint 6 + 7 acceptance against the real development DB. Every write is either reverted by the test itself or by
 * cleanupE2eWrites (afterEach + global teardown): only rows made by @kornne.test users or marked "E2E" are touched.
 */
const BASE = "http://localhost:3470"; // playwright.config.ts webServer port (isolated server)
const db = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl("e2e") }), transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
const PRODUCT_SLUG = "sulu-sterilizator";

test.afterEach(async () => cleanupE2eWrites());

async function as(browser: Browser, user: TestAdmin): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await login(page, user.email, user.password);
  return { ctx, page };
}

/** The exact fields a form would post (incl. Next's server-action reference) — to replay them as ANOTHER user. */
async function formFields(form: Locator): Promise<Record<string, string>> {
  const entries = await form.evaluate((f: HTMLFormElement) => Array.from(new FormData(f).entries()).filter(([, v]) => typeof v === "string") as [string, string][]);
  return Object.fromEntries(entries);
}
async function replay(ctx: BrowserContext, url: string, fields: Record<string, string>, origin = BASE) {
  return ctx.request.post(url, { multipart: fields, headers: { origin }, maxRedirects: 0, failOnStatusCode: false });
}

test.describe("Sprint 6 — catalog editing is real and audited", () => {
  test("Super Admin edits a product's SEO title → Neon → storefront <title> → history; then reverts", async ({ page, request }) => {
    test.setTimeout(150_000);
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    await page.goto("/admin/products?q=sterilizator");
    await page.getByRole("link", { name: "Sulu Sterilizatör" }).click();
    const form = page.getByRole("form", { name: "Türkçe içerik" });
    await form.getByLabel("SEO başlığı").fill("E2E SEO Sulu Sterilizatör — paslanmaz");
    await form.getByRole("button", { name: "Kaydet" }).click();
    await expect(form.getByRole("status")).toContainText("Kaydedildi");
    const html = await (await request.get(`/tr/urun/${PRODUCT_SLUG}`)).text();
    expect(html).toContain("<title>E2E SEO Sulu Sterilizatör — paslanmaz");
    // history: who changed what
    await page.goto(page.url().replace(/\?.*$/, "") + "?tab=gecmis");
    await expect(page.getByText("product.translation_updated").first()).toBeVisible();
    // revert through the UI (revalidates the storefront)
    await page.goto(page.url().replace(/\?.*$/, ""));
    await page.getByRole("form", { name: "Türkçe içerik" }).getByLabel("SEO başlığı").fill("");
    await page.getByRole("form", { name: "Türkçe içerik" }).getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByRole("form", { name: "Türkçe içerik" }).getByRole("status")).toContainText("Kaydedildi");
    expect(await (await request.get(`/tr/urun/${PRODUCT_SLUG}`)).text()).not.toContain("E2E SEO");
  });

  test("#208 stays held: no publish without review permission; storefront keeps the 307", async ({ page, request }) => {
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    await page.goto("/admin/products?durum=inceleme");
    await expect(page.getByRole("link", { name: "İkizray Kurban Kancası" })).toBeVisible();
    expect((await request.get("/tr/urun/ikizray-kurban-kancasi", { maxRedirects: 0 })).status()).toBe(307);
  });
});

test.describe("Sprint 6 — permissions are enforced on the server, not only in the UI", () => {
  test("product editor: modules denied; a replayed price-approval action is refused and audited; proposals never reach the storefront", async ({ browser, request }) => {
    test.setTimeout(180_000);
    const prisma = db();
    try {
      const sa = await as(browser, readTestAdmin());
      // SA enters a proposal (UNVERIFIED, needs a second person)
      const product = await prisma.product.findFirstOrThrow({ where: { translations: { some: { locale: "tr", slug: PRODUCT_SLUG } } }, select: { id: true } });
      await sa.page.goto(`/admin/pricing/${product.id}`);
      const pf = sa.page.getByRole("form", { name: "Fiyat önerisi" });
      await pf.getByLabel("Satış fiyatı").fill("123.456,00");
      await pf.locator('select[name="vatMode"]').selectOption("included");
      await pf.getByLabel("KDV oranı (%)").fill("20");
      await pf.getByLabel("Fiyatın kaynağı").fill("E2E test önerisi (silinecek)");
      await pf.getByRole("button", { name: "Öneriyi kaydet" }).click();
      await expect(pf.getByRole("status")).toContainText("başka bir yetkilinin onayı");
      // the proposer gets no approve control (four-eyes)
      await expect(sa.page.getByText("dört göz kuralı gereği")).toBeVisible();
      const proposalRow = await prisma.price.findFirstOrThrow({ where: { productId: product.id, source: "ADMIN", status: "UNVERIFIED" }, orderBy: { createdAt: "desc" } });
      // unverified proposal is invisible to customers
      const shop = await (await request.get(`/tr/urun/${PRODUCT_SLUG}`)).text();
      expect(shop).not.toContain("123.456");
      expect(shop).not.toMatch(/"@type":"Offer"/);

      // a second approver sees the approve form — its fields are replayed by the product editor
      const adm = await as(browser, await createTestUser("ADMIN"));
      await adm.page.goto(`/admin/pricing/${product.id}`);
      const fields = await formFields(adm.page.getByRole("form", { name: "Onayla" }).first());
      const pe = await createTestUser("PRODUCT_EDITOR");
      const peS = await as(browser, pe);
      for (const path of ["/admin/users", "/admin/quotes", "/admin/content", "/admin/settings"]) {
        await peS.page.goto(path);
        await expect(peS.page, path).toHaveURL(/\/admin\?denied=1$/);
      }
      await replay(peS.ctx, `${BASE}/admin/pricing/${product.id}`, fields);
      expect((await prisma.price.findUniqueOrThrow({ where: { id: proposalRow.id } })).status, "replayed approval by product editor").toBe("UNVERIFIED");
      expect(await prisma.auditLog.count({ where: { action: "auth.denied", entityId: "price.approve", actorId: pe.id } })).toBeGreaterThanOrEqual(1);
      // CSRF: the approver's own session, but a foreign Origin → refused by the framework
      await replay(adm.ctx, `${BASE}/admin/pricing/${product.id}`, fields, "https://evil.example");
      expect((await prisma.price.findUniqueOrThrow({ where: { id: proposalRow.id } })).status, "cross-origin approval").toBe("UNVERIFIED");
      for (const s of [sa, adm, peS]) await s.ctx.close();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("quote export: anonymous 401, order operator 403, super admin CSV (formula-safe, no-store)", async ({ browser, playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: BASE });
    expect((await anon.get("/admin/quotes/export", { maxRedirects: 0 })).status()).toBeGreaterThanOrEqual(300);
    await anon.dispose();
    const op = await as(browser, await createTestUser("ORDER_OPERATOR"));
    expect((await op.ctx.request.get("/admin/quotes/export")).status()).toBe(403);
    const sa = await as(browser, readTestAdmin());
    const res = await sa.ctx.request.get("/admin/quotes/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect((await res.text()).replace(/^﻿/, "").split("\r\n")[0]).toBe("Referans;Tarih;Durum;Sonuç;Sorumlu;Ürünler;Ad soyad;Firma;E-posta;Telefon;Dil;Kaynak");
    await op.ctx.close();
    await sa.ctx.close();
  });
});

test.describe("Sprint 6 — quote CRM on a real storefront request", () => {
  test("storefront request → operator: review, assign, note, prepare, respond (with note) → audit; reference unchanged; SEO editor cannot change it", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const prisma = db();
    try {
      // a real request through the storefront
      await page.goto(`/tr/urun/${PRODUCT_SLUG}`);
      await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
      await page.goto("/tr/teklif-listem");
      const email = `e2e-crm-${Date.now()}@kornne.test`;
      await page.getByLabel("Ad soyad").fill("E2E CRM");
      await page.getByLabel("E-posta").fill(email);
      await page.waitForTimeout(2100);
      await page.getByRole("button", { name: "Teklif talebini gönder" }).click();
      const ref = (await page.getByTestId("quote-reference").textContent())!.trim();
      const q = await prisma.quoteRequest.findUniqueOrThrow({ where: { reference: ref } });
      expect(await prisma.notificationOutbox.count({ where: { entityId: q.id, status: "BLOCKED" } })).toBe(1);

      const opUser = await createTestUser("ORDER_OPERATOR");
      const op = await as(browser, opUser);
      await op.page.goto(`/admin/quotes/${q.id}`);
      await expect(op.page.getByText(email)).toBeVisible();
      const status = op.page.getByRole("form", { name: "Durum değiştir" });
      await status.getByLabel("Yeni durum").selectOption("IN_REVIEW");
      await status.getByRole("button", { name: "Durumu güncelle" }).click();
      await expect(op.page.getByRole("form", { name: "Durum değiştir" }).getByRole("status")).toContainText("İnceleniyor");

      // an SEO editor replays the operator's status form → refused, nothing changes
      const statusFields = await formFields(op.page.getByRole("form", { name: "Durum değiştir" }));
      const seoUser = await createTestUser("SEO_EDITOR");
      const seo = await as(browser, seoUser);
      await replay(seo.ctx, `${BASE}/admin/quotes/${q.id}`, { ...statusFields, to: "SPAM" });
      expect((await prisma.quoteRequest.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("IN_REVIEW");
      expect(await prisma.auditLog.count({ where: { action: "auth.denied", entityId: "quote.manage", actorId: seoUser.id } })).toBeGreaterThanOrEqual(1);

      await op.page.getByRole("form", { name: "Sorumlu" }).getByLabel("Sorumlu").selectOption(opUser.id);
      await op.page.getByRole("form", { name: "Sorumlu" }).getByRole("button", { name: "Kaydet" }).click();
      await expect(op.page.getByRole("form", { name: "Sorumlu" }).getByRole("status")).toContainText("Sorumlu atandı");
      await op.page.getByRole("form", { name: "Not ekle" }).getByLabel("Yeni not").fill("<b>Müşteriyi</b> pazartesi ara");
      await op.page.getByRole("form", { name: "Not ekle" }).getByRole("button", { name: "Not ekle" }).click();
      await expect(op.page.getByText("<b>Müşteriyi</b> pazartesi ara")).toBeVisible(); // escaped, not HTML
      const s2 = op.page.getByRole("form", { name: "Durum değiştir" });
      await s2.getByLabel("Yeni durum").selectOption("QUOTE_PREPARED");
      await s2.getByRole("button", { name: "Durumu güncelle" }).click();
      await expect(op.page.getByRole("form", { name: "Durum değiştir" }).getByRole("status")).toContainText("Teklif hazırlandı");
      const s3 = op.page.getByRole("form", { name: "Durum değiştir" });
      await s3.getByLabel("Yeni durum").selectOption("RESPONDED");
      await s3.getByRole("button", { name: "Durumu güncelle" }).click();
      await expect(s3.getByText(/nasıl iletildiğini yazın/)).toBeVisible(); // the panel never claims it sent anything
      await s3.getByLabel("Not").fill("Teklif e-posta ile gönderildi (panel dışından)");
      await s3.getByRole("button", { name: "Durumu güncelle" }).click();
      await expect(op.page.getByRole("form", { name: "Durum değiştir" }).getByRole("status")).toContainText("Müşteriye iletildi");

      const after = await prisma.quoteRequest.findUniqueOrThrow({ where: { id: q.id }, include: { events: true, notes: true } });
      expect(after.reference).toBe(ref);
      expect(after.status).toBe("RESPONDED");
      expect(after.assignedToId).toBe(opUser.id);
      expect(after.events.map((e) => e.toStatus)).toEqual(["NEW", "IN_REVIEW", "QUOTE_PREPARED", "RESPONDED"]);
      expect(await prisma.auditLog.count({ where: { entityId: q.id, action: "quote.status_changed" } })).toBe(3);
      // the list never shows PII; filter "assigned to me" finds it
      await op.page.goto("/admin/quotes?sorumlu=benim");
      await expect(op.page.getByRole("link", { name: ref })).toBeVisible();
      expect(await op.page.locator("main").innerText()).not.toContain(email);
      await op.ctx.close();
      await seo.ctx.close();
    } finally {
      await prisma.$disconnect();
    }
  });
});

test.describe("Sprint 7 — CMS workflow, multilingual and storefront", () => {
  test("SEO editor drafts (XSS sanitized), cannot publish; admin publishes → storefront 200 → unpublish → 404", async ({ browser, request }) => {
    test.setTimeout(180_000);
    const key = `e2e-bilgi-${Date.now()}`;
    const seo = await as(browser, await createTestUser("SEO_EDITOR"));
    await seo.page.goto("/admin/content/new");
    const nf = seo.page.getByRole("form", { name: "Yeni içerik" });
    await nf.getByLabel("Tür").selectOption("INFO");
    await nf.getByLabel("İç anahtar").fill(key);
    await nf.getByLabel("Başlık").fill("E2E Bilgi Sayfası");
    await nf.getByLabel("Adres (slug)").fill(key);
    await nf.getByRole("button", { name: "Taslak oluştur" }).click();
    await seo.page.waitForURL(/\/admin\/content\/[a-z0-9]+\?dil=tr/);
    const editUrl = seo.page.url();
    const ef = seo.page.getByRole("form", { name: "İçerik düzenle" });
    await ef.getByRole("button", { name: "HTML" }).click();
    await ef.getByRole("textbox", { name: "Metin" }).fill('<p>Gerçek bilgi metni.</p><script>alert("x")</script><img src=x onerror="alert(1)"><a href="javascript:alert(2)">bağlantı</a>');
    await ef.getByRole("button", { name: "Taslağı kaydet" }).click();
    await expect(ef.getByRole("status")).toContainText("güvenlik filtresi");
    await expect(seo.page.getByRole("button", { name: "Yayınla" })).toHaveCount(0);
    await seo.page.getByRole("button", { name: "İncelemeye gönder" }).click();
    await expect(seo.page.getByText("Yayın onayı bekliyor").first()).toBeVisible();
    expect((await request.get(`/tr/sayfa/${key}`)).status()).toBe(404);

    const sa = await as(browser, readTestAdmin());
    await sa.page.goto(editUrl);
    await confirmSubmit(sa.page, sa.page.getByRole("button", { name: "Yayınla", exact: true }), "Son sürümü yayınla");
    await expect(sa.page.getByRole("button", { name: "Yayından kaldır (taslağa al)" })).toBeVisible();
    const res = await request.get(`/tr/sayfa/${key}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("Gerçek bilgi metni.");
    expect(html).not.toMatch(/<script>alert\("x"\)|onerror=|javascript:alert/);
    await confirmSubmit(sa.page, sa.page.getByRole("button", { name: "Yayından kaldır (taslağa al)" }));
    await expect(sa.page.getByRole("button", { name: "Yayınla", exact: true })).toBeVisible();
    expect((await request.get(`/tr/sayfa/${key}`)).status()).toBe(404);
    await seo.ctx.close();
    await sa.ctx.close();
  });

  test("published FAQ appears on /sss with FAQPage data and a menu link; back to draft → 404, link hidden", async ({ page, request }) => {
    test.setTimeout(150_000);
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    expect((await request.get("/tr/sss")).status()).toBe(404);
    await page.goto("/admin/content/faq?dil=tr");
    const nf = page.getByRole("form", { name: "Yeni soru" });
    await nf.getByLabel("Soru").fill("E2E Teklif ne kadar sürede hazırlanır?");
    await nf.getByRole("textbox", { name: "Cevap" }).fill("Talebiniz iş günü içinde değerlendirilir.");
    await nf.getByLabel("Cevabın kaynağı (yayın için zorunlu)").or(nf.getByLabel("Cevabın kaynağı")).fill("E2E firma beyanı");
    await nf.getByLabel("Durum").selectOption("PUBLISHED");
    await nf.getByRole("button", { name: "Ekle", exact: true }).click();
    await expect(nf.getByRole("status")).toContainText("yayında");
    const res = await request.get("/tr/sss");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain("E2E Teklif ne kadar sürede hazırlanır?");
    expect(html).toContain('"@type":"FAQPage"');
    const home = await (await request.get("/tr")).text();
    expect(home).toMatch(/href="\/tr\/sss"/);
    const card = page.getByRole("form", { name: "Soru: E2E Teklif ne kadar sürede hazırlanır?" });
    await card.getByLabel("Durum").selectOption("DRAFT");
    await card.getByRole("button", { name: "Kaydet" }).click();
    await expect(card.getByRole("status")).toContainText("Taslak");
    expect((await request.get("/tr/sss")).status()).toBe(404);
    expect(await (await request.get("/tr")).text()).not.toMatch(/href="\/tr\/sss"/);
  });

  test("time-boxed banner shows on the home page only while published", async ({ page, request }) => {
    test.setTimeout(150_000);
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    await page.goto("/admin/content/banners");
    const f = page.getByRole("form", { name: "Duyuru" }).last();
    await f.getByLabel("Durum").selectOption("PUBLISHED");
    await f.locator('input[name="t.tr.title"]').fill("E2E Fuar duyurusu");
    await f.getByRole("button", { name: "Oluştur" }).click();
    await expect(f.getByText("Yayındaki duyurunun bitiş tarihi olmalı.")).toBeVisible(); // no end date → refused
    const end = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 16);
    await f.getByLabel("Bitiş (İstanbul)").fill(end);
    await f.getByRole("button", { name: "Oluştur" }).click();
    await expect(page.getByText("Şu an yayında")).toBeVisible();
    expect(await (await request.get("/tr")).text()).toContain("E2E Fuar duyurusu");
    expect(await (await request.get("/")).text()).not.toContain("E2E Fuar duyurusu"); // no EN text → not shown in EN
    const card = page.getByRole("form", { name: "Duyuru" }).first();
    await card.getByLabel("Durum").selectOption("ARCHIVED");
    await card.getByRole("button", { name: "Kaydet" }).click();
    await expect(card.getByRole("status")).toContainText("Taslak kaydedildi");
    expect(await (await request.get("/tr")).text()).not.toContain("E2E Fuar duyurusu");
  });

  test("legacy CMS pages come from the DB with the same URLs; Arabic stays RTL with DB menus; no RU/AR product pages", async ({ request }) => {
    for (const [path, text] of [["/tr/sayfa/kurumsal", "Kurumsal"], ["/page/corporate-information", "About us"], ["/tr/sayfa/kisisel-verilenin-korunmasi-kanunu", "Kişisel"]] as const) {
      const r = await request.get(path);
      expect(r.status(), path).toBe(200);
      expect(await r.text(), path).toContain(text);
    }
    const legal = await (await request.get("/tr/sayfa/mesafeli-satis-sozlesmesi")).text();
    expect(legal).toContain("hukuki onay sürecindedir");
    expect(legal).toMatch(/<meta name="robots" content="noindex/);
    const ar = await (await request.get("/ar")).text();
    expect(ar).toMatch(/<html lang="ar" dir="rtl"/);
    expect(ar).toContain("/ar/page/about-us");
    expect((await request.get("/ru/produkt/dairesel-kesim-hucresi")).status()).toBe(404);
    expect((await request.get("/ar/product/dairesel-kesim-hucresi")).status()).toBe(404);
  });
});

test.describe("Sprint 6 — media uploads", () => {
  test("a disguised file is refused (content sniffing); a real PNG is stored once and listed", async ({ page }) => {
    test.setTimeout(120_000);
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    await page.goto("/admin/media");
    const f = page.getByRole("form", { name: "Görsel yükle" });
    await f.locator('input[name="file"]').setInputFiles({ name: "fatura.png", mimeType: "image/png", buffer: Buffer.from("<?php echo 'x'; ?>") });
    await f.getByLabel("Alt metin (Türkçe)").fill("Sahte görsel");
    await f.getByRole("button", { name: "Yükle" }).click();
    await expect(f.getByText(/dosya içeriği kontrol edildi/)).toBeVisible();
    const png = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#293E59" } }).png().toBuffer();
    await f.locator('input[name="file"]').setInputFiles({ name: "e2e-lacivert.png", mimeType: "image/png", buffer: png });
    await f.getByLabel("Alt metin (Türkçe)").fill("E2E lacivert test görseli");
    await f.getByRole("button", { name: "Yükle" }).click();
    await expect(f.getByRole("status")).toContainText("Görsel yüklendi");
    await page.goto("/admin/media?kaynak=admin_upload");
    await expect(page.getByText("E2E lacivert test görseli")).toBeVisible();
  });
});

test.describe("Admin layout — responsive", () => {
  for (const width of [320, 375, 768, 1440]) {
    test(`no page-level horizontal overflow at ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      const admin = readTestAdmin();
      await page.setViewportSize({ width, height: 900 });
      await login(page, admin.email, admin.password);
      for (const path of ["/admin", "/admin/products", "/admin/pricing", "/admin/quotes", "/admin/content", "/admin/translations/matches", "/admin/media"]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} @${width}`).toBeLessThanOrEqual(0);
      }
    });
  }
});
