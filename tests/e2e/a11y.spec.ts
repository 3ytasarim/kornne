import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";
import { readTestAdmin } from "./test-admin";

/**
 * Sprint 10 — automated accessibility scan (axe-core, WCAG 2.0/2.1 A + AA rules) on storefront and admin screens,
 * light and dark theme, desktop and 375 px. Automated checks find ~30–40 % of issues: manual screen-reader passes
 * (NVDA / VoiceOver) are still listed as NOT-TESTED in the report.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(summary, `${label}\n${summary.join("\n")}`).toEqual([]);
  return r.violations.length;
}

const STOREFRONT = ["/tr", "/tr/kategori/tum-urunler", "/tr/urun/dairesel-kesim-hucresi", "/tr/arama?q=kesim", "/tr/teklif-listem", "/tr/iletisim", "/tr/sayfa/kurumsal", "/bu-sayfa-yok-a11y", "/", "/de", "/ar", "/ar/category/all-products"];

test.describe("axe — storefront", () => {
  for (const path of STOREFRONT) {
    test(`${path} (light, 1440)`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
      await page.goto(path);
      await scan(page, path);
    });
  }
  for (const path of ["/tr", "/tr/urun/dairesel-kesim-hucresi", "/ar"]) {
    test(`${path} (dark, 375)`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.goto(path);
      await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
      await scan(page, `${path} dark`);
    });
  }
});

test.describe("axe — admin", () => {
  test("login + key admin screens", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/admin/login");
    await scan(page, "/admin/login");
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    for (const path of ["/admin", "/admin/products", "/admin/pricing", "/admin/quotes", "/admin/content", "/admin/translations", "/admin/seo/qa", "/admin/seo/gorseller", "/admin/merchant", "/admin/merchant/baglanti", "/admin/analytics", "/admin/settings", "/admin/users"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await scan(page, path);
    }
  });
});
