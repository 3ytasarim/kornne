import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";

/**
 * Sprint 10 consent banner screenshots on the prod-like build (FAKE analytics id; Google requests aborted).
 * QA_SHOTS=1 only.
 */
test.skip(!process.env.QA_SHOTS, "set QA_SHOTS=1 to capture screenshots");
const DIR = "docs/qa/screenshots";
mkdirSync(DIR, { recursive: true });

test("s1011 consent banner", async ({ page }) => {
  await page.route(/googletagmanager\.com|google-analytics\.com/, (r) => r.abort());
  for (const [name, path, width] of [["consent-1440", "/", 1440], ["consent-375", "/", 375], ["consent-ar-375", "/ar", 375]] as const) {
    await page.context().clearCookies();
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await page.goto(path);
    await page.getByTestId("consent-banner").waitFor();
    await page.screenshot({ path: `${DIR}/s1011-${name}.png` });
  }
  await page.context().clearCookies();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/urun/dairesel-kesim-hucresi");
  await page.getByRole("button", { name: "Tercihleri ayarla" }).click();
  await page.screenshot({ path: `${DIR}/s1011-consent-preferences-1440.png` });
});
