import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { cleanupE2eWrites } from "./cleanup";
import { login } from "./helpers";
import { readTestAdmin } from "./test-admin";

/**
 * Sprint 8+9 screenshots (docs/qa/screenshots/s89-*). QA_SHOTS=1 only. Isolated server + local DB copy; the
 * audit / dry-run rows created for the shots are removed by cleanupE2eWrites. No real customer PII on any screen.
 */
test.skip(!process.env.QA_SHOTS, "set QA_SHOTS=1 to capture screenshots");
test.afterAll(async () => cleanupE2eWrites());
const DIR = "docs/qa/screenshots";
mkdirSync(DIR, { recursive: true });

async function shot(page: Page, name: string, path: string, width: number, opts: { dark?: boolean; full?: boolean } = {}) {
  await page.emulateMedia({ colorScheme: opts.dark ? "dark" : "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: opts.full ?? true });
}

test("s89 admin SEO + Merchant screens", async ({ page }) => {
  test.setTimeout(600_000);
  const admin = readTestAdmin();
  await login(page, admin.email, admin.password);
  // one audit run and one MOCK run so the screens show real results
  await page.goto("/admin/seo/qa");
  await page.getByRole("button", { name: "Denetimi çalıştır" }).click();
  await page.getByText(/Denetim tamamlandı/).waitFor({ timeout: 180_000 });
  await page.goto("/admin/merchant/baglanti");
  await page.getByRole("button", { name: "MOCK senkron" }).click();
  await page.getByText(/MOCK — GÖNDERİLMEDİ/).waitFor();

  await shot(page, "s89-seo-qa-1440", "/admin/seo/qa", 1440, { full: false });
  await shot(page, "s89-seo-qa-errors-filter-1440", "/admin/seo/qa?tur=legacy-redirect", 1440, { full: false });
  await shot(page, "s89-seo-qa-375", "/admin/seo/qa", 375, { full: false });
  await shot(page, "s89-image-seo-1440", "/admin/seo/gorseller", 1440, { full: false });
  await shot(page, "s89-image-seo-320", "/admin/seo/gorseller", 320, { full: false });
  await shot(page, "s89-geo-1440", "/admin/seo/geo", 1440, { full: false });
  await shot(page, "s89-seo-fields-dark-1440", "/admin/seo", 1440, { dark: true, full: false });
  await shot(page, "s89-merchant-dashboard-1440", "/admin/merchant", 1440, { full: false });
  await shot(page, "s89-merchant-dashboard-768", "/admin/merchant", 768, { full: false });
  await shot(page, "s89-merchant-dashboard-dark-375", "/admin/merchant", 375, { dark: true, full: false });
  await shot(page, "s89-merchant-feed-1440", "/admin/merchant/feed", 1440, { full: false });
  await shot(page, "s89-merchant-mapping-1440", "/admin/merchant/eslesme", 1440, { full: false });
  await shot(page, "s89-merchant-connection-1440", "/admin/merchant/baglanti", 1440, { full: false });
  await shot(page, "s89-merchant-connection-320", "/admin/merchant/baglanti", 320, { full: false });
  await shot(page, "s89-home-ru-320", "/ru", 320, { full: false });
  await shot(page, "s89-home-ar-375", "/ar", 375, { full: false });
});
