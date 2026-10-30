// Sprint 12 screenshots of the local preview (:3470). Read-only except one cart add in a throwaway browser context.
import { chromium } from "@playwright/test";
const base = "http://localhost:3470";
const out = "docs/qa/screens-s12";
const browser = await chromium.launch({ channel: "chrome" });
for (const [w, h, tag] of [[1440, 900, "desktop"], [390, 844, "mobile"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: tag === "mobile" ? 2 : 1 });
  const page = await ctx.newPage();
  for (const [name, path, full] of [["home", "/", true], ["category", "/kategori/tum-urunler", false], ["product", "/urun/dos-acma-testeresi", false], ["banks", "/banka-hesaplari", false], ["status", "/siparisim-ne-durumda", false]]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: full });
  }
  await page.goto(base + "/urun/dos-acma-testeresi", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sepete ekle", exact: true }).click();
  await page.goto(base + "/sepetim", { waitUntil: "networkidle" });
  await page.getByTestId("cart-total").filter({ hasText: "TL" }).waitFor();
  await page.screenshot({ path: `${out}/${tag}-cart.png` });
  await page.goto(base + "/odeme", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/${tag}-checkout.png` });
  await ctx.close();
}
await browser.close();
console.log("ok");
