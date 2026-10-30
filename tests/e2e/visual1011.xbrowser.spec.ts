import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import { login } from "./helpers";
import { readTestAdmin } from "./test-admin";

/**
 * Sprint 10+11 screenshots per engine (docs/qa/screenshots/s1011-*). QA_SHOTS=1 only. Isolated noindex server.
 * Runs in chrome, chromium, firefox and webkit → the same pages rendered by every engine.
 */
test.skip(!process.env.QA_SHOTS, "set QA_SHOTS=1 to capture screenshots");
const DIR = "docs/qa/screenshots";
mkdirSync(DIR, { recursive: true });

test("s1011 storefront per engine", async ({ page, browserName }, info) => {
  test.setTimeout(180_000);
  const tag = info.project.name;
  const shot = async (name: string, path: string, width: number, dark = false) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(path);
    if (dark) await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await page.waitForTimeout(browserName === "firefox" ? 600 : 300);
    await page.screenshot({ path: `${DIR}/s1011-${name}-${tag}.png`, fullPage: false });
  };
  await shot("home-1440", "/", 1440);
  await shot("product-375", "/urun/dairesel-kesim-hucresi", 375);
  await shot("home-ar-375", "/ar", 375);
  if (tag === "chrome") {
    await shot("home-ru-320", "/ru", 320);
    await shot("product-dark-375", "/urun/dairesel-kesim-hucresi", 375, true);
    await shot("category-ar-1440", "/ar/category/all-products", 1440);
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    await shot("admin-analytics-1440", "/admin/analytics", 1440);
    await shot("admin-analytics-375", "/admin/analytics", 375);
  }
});
