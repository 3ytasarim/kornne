import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { readTestAdmin } from "./test-admin";

/**
 * Screenshot capture for visual QA (docs/qa/screenshots). Runs only with QA_SHOTS=1 so the regular suite stays fast.
 *   QA_SHOTS=1 npx playwright test tests/e2e/visual.spec.ts
 */
test.skip(!process.env.QA_SHOTS, "set QA_SHOTS=1 to capture screenshots");
const DIR = "docs/qa/screenshots";
mkdirSync(DIR, { recursive: true });

const SHOTS: [string, string, number, ("light" | "dark")?][] = [
  ["home-1440", "/", 1440],
  ["home-375", "/", 375],
  ["home-320", "/", 320],
  ["home-dark-1440", "/", 1440, "dark"],
  ["home-ar-375", "/ar", 375],
  ["category-1440", "/kategori/mezbaha-ekipmanlari", 1440],
  ["category-1024", "/kategori/tum-urunler", 1024],
  ["category-768", "/kategori/robotik-sistemler", 768],
  ["category-375", "/kategori/tum-urunler", 375],
  ["category-filtered-1440", "/kategori/tum-urunler?kategori=kurban-ekipmanlari&siralama=ad-artan", 1440],
  ["category-en-1440", "/en/category/all-products", 1440],
  ["product-1440", "/urun/dairesel-kesim-hucresi", 1440],
  ["product-375", "/urun/kurban-yatirma-kabini", 375],
  ["search-results-1024", "/arama?q=testere", 1024],
  ["search-empty-375", "/arama?q=xyzxyz", 375],
  ["404-1440", "/olmayan-sayfa", 1440],
  // Sprint 4 + 5
  ["s45-product-1440", "/urun/dairesel-kesim-hucresi", 1440],
  ["s45-product-dark-1440", "/urun/sulu-sterilizator", 1440, "dark"],
  ["s45-product-variant-1024", "/urun/kucuk-bas-stoklama-kancasi", 1024],
  ["s45-product-375", "/urun/hijyen-geciti", 375],
  ["s45-quote-empty-375", "/teklif-listem", 375],
  ["s12-cart-empty-1440", "/sepetim", 1440],
  ["s12-checkout-empty-375", "/odeme", 375],
];

/** Fills the quote list through the real UI (localStorage only, nothing is sent). */
async function fillQuoteList(page: import("@playwright/test").Page) {
  for (const p of ["/urun/dairesel-kesim-hucresi", "/urun/sulu-sterilizator", "/urun/hijyen-geciti"]) {
    await page.goto(p);
    await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Teklif listesine eklendi|Sepete eklendi/ })).toBeVisible();
  }
}

for (const [name, path, width] of [["s45-quote-list-1440", "/teklif-listem", 1440], ["s45-quote-list-375", "/teklif-listem", 375], ["s45-quote-list-ar-375", "/ar/quote-list", 375]] as const) {
  test(`shot ${name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fillQuoteList(page);
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  });
}

test("shot s45-sticky-bar-375", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/urun/dairesel-kesim-hucresi");
  await page.evaluate(() => window.scrollBy(0, document.getElementById("quote-cta")!.getBoundingClientRect().bottom + 300));
  await expect(page.getByRole("button", { name: "Teklif al" })).toBeVisible();
  await page.screenshot({ path: `${DIR}/s45-sticky-bar-375.png` });
});

test("shot s45-variant-error-1024", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/urun/kucuk-bas-stoklama-kancasi");
  await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
  await page.locator("#quote-cta").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DIR}/s45-variant-error-1024.png` });
});

test("shot s45-quote-success + admin quotes", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fillQuoteList(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/teklif-listem");
  await page.getByRole("button", { name: "Teklif talebini gönder" }).click(); // invalid → field errors
  await expect(page.getByText("E-posta veya telefon girin.")).toBeVisible();
  await page.screenshot({ path: `${DIR}/s45-quote-errors-1440.png`, fullPage: true });
  await page.getByLabel("Ad soyad").fill("Ekran Görüntüsü Test");
  await page.getByLabel("E-posta").fill(`shot-${Date.now()}@kornne.test`); // removed by global teardown
  await page.waitForTimeout(2100);
  await page.getByRole("button", { name: "Teklif talebini gönder" }).click();
  const ref = (await page.getByTestId("quote-reference").textContent())!.trim();
  await page.screenshot({ path: `${DIR}/s45-quote-success-1440.png` });

  const admin = readTestAdmin();
  await page.goto("/admin/login");
  await page.getByLabel("E-posta").fill(admin.email);
  await page.getByLabel("Şifre").fill(admin.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/quotes");
  await page.screenshot({ path: `${DIR}/s45-admin-quotes-1440.png`, fullPage: true });
  await page.getByRole("link", { name: ref }).click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/s45-admin-quote-detail-1440.png`, fullPage: true });
});

for (const [name, path, width, scheme] of SHOTS) {
  test(`shot ${name}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme ?? "light", reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // trigger lazy images below the fold before a full-page capture
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
  });
}

test("shot mobile-drawer-375", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menüyü aç" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: `${DIR}/mobile-drawer-375.png` });
});

test("shot megamenu-1440", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Ana menü" }).getByRole("button", { name: "Ürünler" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/megamenu-1440.png` });
});

test("shot admin-catalog-qa-1440", async ({ page }) => {
  const admin = readTestAdmin();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/login");
  await page.getByLabel("E-posta").fill(admin.email);
  await page.getByLabel("Şifre").fill(admin.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/catalog-qa");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/admin-catalog-qa-1440.png`, fullPage: true });
});
