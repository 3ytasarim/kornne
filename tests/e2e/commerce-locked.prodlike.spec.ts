import { expect, test } from "@playwright/test";

/**
 * Sprint 12 — production defaults: the prod-like build has NO commerce env → the EFT/Havale checkout stays locked and
 * the cart offers the quote list instead. (The dev build opens it with the local-preview env only.)
 */
test("checkout is locked without the commerce env; cart still prices and offers a quote", async ({ page }) => {
  await page.goto("/tr/odeme");
  await expect(page.getByText("Online sepet ve ödeme şu an kapalı")).toBeVisible();
  await expect(page.getByRole("link", { name: "Teklif listesine git" })).toHaveAttribute("href", "/tr/teklif-listem");

  await page.goto("/tr/urun/dos-acma-testeresi");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  await page.goto("/tr/sepetim");
  await expect(page.getByTestId("cart-total")).toContainText("TL");
  await expect(page.getByText("Online sipariş henüz açılmadı")).toBeVisible();
  await expect(page.getByRole("link", { name: "Siparişi tamamla" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Bu sepet için teklif iste" })).toBeVisible();
});
