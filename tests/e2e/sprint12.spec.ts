import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { cleanupE2eWrites } from "./cleanup";
import { confirmSubmit, login } from "./helpers";
import { createTestUser } from "./test-admin";

/**
 * Sprint 12 — B2B shop on the dev build (LOCAL commerce env, local DB copy with dummy bank accounts):
 * card quick-add → cart (server totals) → B2B checkout → order number + banks → payment notice → status lookup →
 * admin confirms the transfer → customer sees "Ödeme onaylandı". Every write is a TEST- order removed afterwards.
 */
test.afterEach(async () => cleanupE2eWrites());

const fillCheckout = async (page: import("@playwright/test").Page, email: string) => {
  await page.getByLabel("Firma unvanı").fill("E2E Et Sanayi A.Ş.");
  await page.getByLabel("Vergi dairesi").fill("Gebze");
  await page.getByLabel("Vergi no / TC kimlik no").fill("1234567890");
  await page.getByLabel("Ad soyad").fill("E2E Test");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Telefon").fill("+90 500 000 00 02");
  await page.locator("input[name=city]").fill("Kocaeli");
  await page.getByLabel("İlçe").fill("Dilovası");
  await page.getByRole("textbox", { name: "Fatura adresi" }).fill("E2E Mah. Test Sok. No: 1");
  await page.getByRole("checkbox", { name: /Mesafeli satış sözleşmesini/ }).check();
};

test("header: client wordmark, cart button, order self-service links", async ({ page }) => {
  await page.goto("/tr");
  const logo = page.getByRole("link", { name: /KORNNE — Anasayfa/ }).locator("img").first();
  await expect(logo).toHaveAttribute("src", /kornne-wordmark/);
  const box = await logo.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40); // desktop: never a tiny badge
  expect(box!.height).toBeLessThanOrEqual(56); // …and never oversized
  await expect(page.locator("header").getByRole("link", { name: "Sepetim" })).toHaveAttribute("href", "/tr/sepetim");
  for (const name of ["Siparişim Ne Durumda", "Ödeme Bildirimi", "Banka Hesapları"]) await expect(page.locator("header").getByRole("link", { name }).first()).toBeVisible();
  // no decorative grid pattern in the hero any more
  expect(await page.content()).not.toContain("background-size:56px_56px");
});

test("full B2B order: cart → checkout → notice → lookup → admin confirms", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = `e2e-order-${Date.now()}@kornne.test`;
  await page.goto("/tr/urun/dos-acma-testeresi");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Adedi artır" }).first().click();
  await page.getByRole("button", { name: "Hemen sipariş ver" }).click();
  await page.waitForURL(/\/sepetim$/);
  await expect(page.getByTestId("cart-total")).toContainText("TL");
  const total = (await page.getByTestId("cart-total").innerText()).trim();
  await expect(page.getByText("KDV (%20)")).toBeVisible();

  await page.getByRole("link", { name: "Siparişi tamamla" }).click();
  await page.waitForURL(/\/odeme$/);
  await expect(page.getByTestId("checkout-total")).toHaveText(total);
  // validation: empty submit → field errors, nothing stored
  await page.getByRole("button", { name: "Siparişi oluştur" }).click();
  await expect(page.getByText("Bu alan zorunlu.").first()).toBeVisible();
  await fillCheckout(page, email);
  await page.waitForTimeout(3_100); // minimum fill time (anti-bot)
  await page.getByRole("button", { name: "Siparişi oluştur" }).click();
  await expect(page.getByTestId("order-placed")).toBeVisible();
  const number = (await page.getByTestId("order-number").innerText()).trim();
  expect(number).toMatch(/^TEST-KRN-\d{6}-[A-Z0-9]{5}$/);
  await expect(page.getByTestId("order-total")).toHaveText(total);
  await expect(page.getByText("TR53 0001 5000 0000 0000 0000 01")).toBeVisible(); // dummy local IBAN
  await expect(page.locator("header").getByRole("link", { name: "Sepetim" })).toHaveAccessibleName("Sepetim"); // cart emptied

  // status lookup: wrong e-mail reveals nothing
  await page.goto("/tr/siparisim-ne-durumda");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Sipariş numarası").fill(number);
  await page.getByLabel("E-posta").fill("someone-else@kornne.test");
  await page.getByRole("button", { name: "Sorgula" }).click();
  await expect(page.getByText("eşleşen sipariş bulunamadı")).toBeVisible();
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Sorgula" }).click();
  await expect(page.getByTestId("order-status-label")).toHaveText("Ödeme bekleniyor");

  // payment notice
  await page.goto("/tr/odeme-bildirimi");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Sipariş numarası").fill(number);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Gönderen (ad soyad veya firma)").fill("E2E Et Sanayi");
  await page.getByLabel("Ödeme yapılan banka").selectOption({ index: 1 });
  await page.getByLabel("Gönderilen tutar").fill(total.replace(" TL", ""));
  await page.getByRole("button", { name: "Bildirimi gönder" }).click();
  await expect(page.getByTestId("notice-success")).toBeVisible();

  // admin confirms the transfer
  const admin = await createTestUser("ADMIN");
  const ctx = await browser.newContext({ baseURL: "http://localhost:3470" });
  const ap = await ctx.newPage();
  await login(ap, admin.email, admin.password);
  await ap.goto("/admin/orders");
  await ap.getByRole("link", { name: number }).click();
  await expect(ap.getByText("Bildirim: 1").or(ap.getByText("Bekliyor")).first()).toBeVisible();
  await ap.getByLabel("Kontrol notu").fill("E2E hesap hareketi");
  await confirmSubmit(ap, ap.getByRole("button", { name: "Ödemeyi onayla" }), /Ödemeyi onaylıyorum/);
  // the confirm card disappears after the state change; the header badge shows the new status
  await expect(ap.locator("main").getByText("Ödendi", { exact: true }).first()).toBeVisible();
  await expect(ap.getByRole("button", { name: "Ödemeyi onayla" })).toHaveCount(0);
  await ctx.close();

  await page.goto("/tr/siparisim-ne-durumda");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Sipariş numarası").fill(number);
  await page.getByLabel("E-posta").fill(email);
  await page.getByRole("button", { name: "Sorgula" }).click();
  await expect(page.getByTestId("order-status-label")).toHaveText("Ödeme onaylandı");
});

test("bank accounts page lists only active accounts with valid IBANs + copy button", async ({ page }) => {
  await page.goto("/tr/banka-hesaplari");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Banka hesaplarımız");
  expect(await page.getByRole("button", { name: /IBAN'ı kopyala/ }).count()).toBe(6);
  await expect(page.getByText("Mezbaha Teknolojileri A.Ş.").first()).toBeVisible();
});

test("a11y (axe): cart, checkout, status, notice, banks", async ({ page }) => {
  await page.goto("/tr/urun/dos-acma-testeresi");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  for (const path of ["/tr/sepetim", "/tr/odeme", "/tr/siparisim-ne-durumda", "/tr/odeme-bildirimi", "/tr/banka-hesaplari"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`), path).toEqual([]);
  }
});

test("mobile 375: no horizontal overflow on shop pages", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/tr", "/tr/kategori/tum-urunler", "/tr/urun/dos-acma-testeresi", "/tr/sepetim", "/tr/odeme", "/tr/siparisim-ne-durumda", "/tr/banka-hesaplari"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
