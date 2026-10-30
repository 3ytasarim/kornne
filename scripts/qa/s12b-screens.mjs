// Sprint 12b (animated hero) screenshots of the local preview — read-only.
import { chromium } from "@playwright/test";
const base = "http://localhost:3470";
const out = "docs/qa/screens-s12";
const browser = await chromium.launch({ channel: "chrome" });
for (const [w, h, tag, dpr] of [[1440, 900, "desktop", 1], [390, 844, "mobile", 2]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage();
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${tag}-hero.png` });
  // scroll through so lazy images load, then capture the whole page
  for (let y = 0; y < 9000; y += 600) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
  }
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/${tag}-home-v2.png`, fullPage: true });
  await page.locator("#home-gallery").scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${tag}-gallery.png` });
}
await browser.close();
console.log("ok");
