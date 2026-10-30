import { expect, test } from "@playwright/test";

/**
 * Sprint 10 — cross-browser storefront checks. Runs in the Playwright projects chromium, firefox, webkit (and the
 * system-Chrome project). Read-only against the isolated noindex server (:3470); the quote list lives in
 * localStorage only (no request is submitted here). WebKit = Playwright's WebKit build, NOT a real Safari device.
 */


test.describe("storefront renders in every engine", () => {
  for (const [path, lang, dir] of [["/", "tr", "ltr"], ["/kategori/tum-urunler", "tr", "ltr"], ["/urun/dairesel-kesim-hucresi", "tr", "ltr"], ["/arama?q=kesim", "tr", "ltr"], ["/teklif-listem", "tr", "ltr"], ["/en", "en", "ltr"], ["/ru", "ru", "ltr"], ["/ar", "ar", "rtl"]] as const) {
    test(`${path}: 200, lang/dir, one h1, no overflow at 320 and 1440`, async ({ page, browserName }) => {
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("about:blank");
        const res = await page.goto(path);
        expect([200, 304]).toContain(res?.status()); // Firefox revalidates the second visit (304)
        // Firefox reports Next's hydration-time history.replaceState as a same-URL navigation that Playwright's
        // locators then wait on: read the DOM directly (retrying) instead
        if (browserName === "firefox") await page.waitForTimeout(400);
        const facts = () => page.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, h1: document.querySelectorAll("h1").length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth })).catch(() => null);
        await expect.poll(facts, { timeout: 15_000 }).toMatchObject({ lang, dir, h1: 1 });
        expect((await facts())!.over, `${path} @${width}`).toBeLessThanOrEqual(0);
      }
    });
  }

  test("real 404 page with navigation back", async ({ page }) => {
    const res = await page.goto("/bu-sayfa-yok-xbrowser");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Anasayfaya dön" })).toBeVisible();
  });
});

test.describe("keyboard and dialogs", () => {
  test("skip link moves focus to the main content", async ({ page, browserName }) => {
    await page.goto("/");
    const skip = page.getByRole("link", { name: "İçeriğe geç" });
    // Safari/WebKit does not move Tab focus to links by default ("Tab highlights each item" is off) → focus it directly
    if (browserName === "webkit") await skip.focus();
    else await page.keyboard.press("Tab");
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("mega menu: opens, Esc closes and returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const trigger = page.getByRole("navigation", { name: "Ana menü" }).getByRole("button", { name: "Ürünler" });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });

  test("product gallery lightbox: dialog, arrow keys, Esc", async ({ page }) => {
    await page.goto("/urun/dairesel-kesim-hucresi");
    await page.getByRole("button", { name: /Görseli büyüt/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("Arabic mobile drawer opens from the right and closes with Esc", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ar");
    await page.getByRole("button", { name: "فتح القائمة" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box!.x + box!.width).toBeGreaterThan(385);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("quote list: add from the product page, count updates, form errors are announced and linked", async ({ page }) => {
    await page.goto("/urun/hijyen-geciti");
    await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
    await page.goto("/teklif-listem");
    await expect(page.getByRole("heading", { name: "1 ürün" })).toBeVisible();
    await page.getByLabel("Ad soyad").fill("E2E Tarayıcı");
    await page.getByRole("button", { name: "Teklif talebini gönder" }).click();
    const err = page.getByText("E-posta veya telefon girin.");
    await expect(err).toBeVisible();
    const email = page.getByLabel("E-posta");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    expect(await email.getAttribute("aria-describedby")).toBeTruthy();
    await page.evaluate(() => localStorage.clear());
  });

  test("admin login is keyboard operable and noindex", async ({ page }) => {
    const res = await page.goto("/admin/login");
    expect(res?.headers()["x-robots-tag"]).toMatch(/noindex/);
    await page.getByLabel("E-posta").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Şifre")).toBeFocused();
  });
});
