import "dotenv/config";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cleanupE2eWrites } from "./cleanup";
import { login } from "./helpers";
import { readTestAdmin } from "./test-admin";
import { testDatabaseUrl } from "../test-db-url.mjs";

/**
 * Sprint 6+7 screenshots (docs/qa/screenshots/s67-*). QA_SHOTS=1 only. Rows created for a shot (a price proposal,
 * a quote, an E2E page) are removed by cleanupE2eWrites; screenshots contain only test data, no real customer PII.
 */
test.skip(!process.env.QA_SHOTS, "set QA_SHOTS=1 to capture screenshots");
test.afterAll(async () => cleanupE2eWrites());
const DIR = "docs/qa/screenshots";
mkdirSync(DIR, { recursive: true });
const db = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl("e2e") }) });

async function shot(page: Page, name: string, path: string, width: number, opts: { dark?: boolean; full?: boolean } = {}) {
  await page.emulateMedia({ colorScheme: opts.dark ? "dark" : "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: opts.full ?? true });
}

test("s67 admin screens", async ({ page }) => {
  test.setTimeout(600_000);
  const admin = readTestAdmin();
  await login(page, admin.email, admin.password);
  const prisma = db();
  try {
    const product = await prisma.product.findFirstOrThrow({ where: { translations: { some: { locale: "tr", slug: "dairesel-kesim-hucresi" } } }, select: { id: true } });
    const variant = await prisma.product.findFirstOrThrow({ where: { translations: { some: { locale: "tr", slug: "kucuk-bas-stoklama-kancasi" } } }, select: { id: true } });
    const low = await prisma.legacyMatchSuggestion.findFirstOrThrow({ where: { sourceLocale: "en", sourceLegacyId: "142" }, select: { id: true } });
    const page1 = await prisma.page.findUniqueOrThrow({ where: { key: "kurumsal" }, select: { id: true } });

    await shot(page, "s67-dashboard-1440", "/admin", 1440);
    await shot(page, "s67-dashboard-375", "/admin", 375);
    await shot(page, "s67-dashboard-dark-1440", "/admin", 1440, { dark: true });
    await shot(page, "s67-products-1440", "/admin/products", 1440);
    await shot(page, "s67-products-768", "/admin/products?kalite=celiski", 768);
    await shot(page, "s67-products-320", "/admin/products", 320);
    await shot(page, "s67-product-edit-1440", `/admin/products/${product.id}`, 1440);
    await shot(page, "s67-product-edit-375", `/admin/products/${product.id}`, 375);
    await shot(page, "s67-product-languages-1440", `/admin/products/${product.id}?tab=diller`, 1440);
    await shot(page, "s67-product-variants-1440", `/admin/products/${variant.id}?tab=secenekler`, 1440);
    await shot(page, "s67-product-images-1440", `/admin/products/${product.id}?tab=gorseller`, 1440);
    await shot(page, "s67-product-tech-1440", `/admin/products/${product.id}?tab=teknik`, 1440);
    await shot(page, "s67-product-preview-1440", `/admin/products/${product.id}/preview`, 1440);
    await shot(page, "s67-pricing-1440", "/admin/pricing?filtre=celiski", 1440);
    // a proposal for the four-eyes view (removed by cleanup)
    await page.goto(`/admin/pricing/${product.id}`);
    const pf = page.getByRole("form", { name: "Fiyat önerisi" });
    await pf.getByLabel("Satış fiyatı").fill("1.807.479,94");
    await pf.locator('select[name="vatMode"]').selectOption("included");
    await pf.getByLabel("KDV oranı (%)").fill("20");
    await pf.getByLabel("Fiyatın kaynağı").fill("E2E ekran görüntüsü — örnek öneri (silinir)");
    await pf.getByRole("button", { name: "Öneriyi kaydet" }).click();
    await expect(pf.getByRole("status")).toBeVisible();
    await shot(page, "s67-price-detail-1440", `/admin/pricing/${product.id}`, 1440);
    await shot(page, "s67-matches-1440", "/admin/translations/matches?risk=dusuk", 1440);
    await shot(page, "s67-match-compare-1440", `/admin/translations/matches/${low.id}`, 1440);
    await shot(page, "s67-translations-coverage-1440", "/admin/translations", 1440);
    await shot(page, "s67-content-1440", "/admin/content", 1440);
    await shot(page, "s67-content-edit-tr-1440", `/admin/content/${page1.id}?dil=tr`, 1440);
    await shot(page, "s67-content-edit-ar-1440", `/admin/content/${page1.id}?dil=ar`, 1440);
    await shot(page, "s67-content-edit-768", `/admin/content/${page1.id}?dil=tr`, 768);
    await shot(page, "s67-faq-1440", "/admin/content/faq", 1440);
    await shot(page, "s67-banners-1440", "/admin/content/banners", 1440);
    await shot(page, "s67-menus-1440", "/admin/content/menus", 1440);
    await shot(page, "s67-media-1440", "/admin/media", 1440);
    await shot(page, "s67-seo-1440", "/admin/seo", 1440);
    await shot(page, "s67-redirects-1440", "/admin/redirects", 1440);
    await shot(page, "s67-merchant-1440", "/admin/merchant", 1440);
    await shot(page, "s67-settings-1440", "/admin/settings", 1440);
    await shot(page, "s67-users-1440", "/admin/users", 1440);
    await shot(page, "s67-audit-1440", "/admin/audit", 1440);
    await shot(page, "s67-orders-blocked-1440", "/admin/orders", 1440);
  } finally {
    await prisma.$disconnect();
  }
});

test("s67 quote CRM screens (test request)", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/tr/urun/dairesel-kesim-hucresi");
  await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
  await page.goto("/tr/urun/sulu-sterilizator");
  await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
  await page.goto("/tr/teklif-listem");
  await page.getByLabel("Ad soyad").fill("Örnek Test Müşteri");
  await page.getByLabel("Firma (isteğe bağlı)").fill("Test Et Entegre (örnek)");
  await page.getByLabel("E-posta").fill(`shot-crm-${Date.now()}@kornne.test`);
  await page.waitForTimeout(2100);
  await page.getByRole("button", { name: "Teklif talebini gönder" }).click();
  const ref = (await page.getByTestId("quote-reference").textContent())!.trim();
  const admin = readTestAdmin();
  await login(page, admin.email, admin.password);
  const prisma = db();
  try {
    const q = await prisma.quoteRequest.findUniqueOrThrow({ where: { reference: ref } });
    await page.goto(`/admin/quotes/${q.id}`);
    const status = page.getByRole("form", { name: "Durum değiştir" });
    await status.getByLabel("Yeni durum").selectOption("IN_REVIEW");
    await status.getByRole("button", { name: "Durumu güncelle" }).click();
    await expect(page.getByRole("form", { name: "Durum değiştir" }).getByRole("status")).toBeVisible();
    await page.getByRole("form", { name: "Not ekle" }).getByLabel("Yeni not").fill("Kapasite ve teslim yeri soruldu (örnek iç not).");
    await page.getByRole("form", { name: "Not ekle" }).getByRole("button", { name: "Not ekle" }).click();
    await expect(page.getByText("Kapasite ve teslim yeri soruldu")).toBeVisible();
    await shot(page, "s67-quote-detail-1440", `/admin/quotes/${q.id}`, 1440);
    await shot(page, "s67-quote-detail-375", `/admin/quotes/${q.id}`, 375);
    await shot(page, "s67-quotes-1440", "/admin/quotes", 1440);
    await shot(page, "s67-customers-1440", "/admin/customers", 1440);
  } finally {
    await prisma.$disconnect();
  }
});

test("s67 storefront after Sprint 7 (DB menus / CMS pages / RTL / dark)", async ({ page }) => {
  test.setTimeout(240_000);
  await shot(page, "s67-store-home-ar-375", "/ar", 375);
  await shot(page, "s67-store-corporate-1440", "/tr/sayfa/kurumsal", 1440);
  await shot(page, "s67-store-corporate-en-768", "/page/corporate-information", 768);
  await shot(page, "s67-store-legal-320", "/tr/sayfa/mesafeli-satis-sozlesmesi", 320);
  await shot(page, "s67-store-product-dark-1440", "/tr/urun/dairesel-kesim-hucresi", 1440, { dark: true });
  await shot(page, "s67-store-footer-ar-1440", "/ar", 1440);
});
