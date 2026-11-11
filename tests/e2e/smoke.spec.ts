import { expect, test } from "@playwright/test";
import { readTestAdmin } from "./test-admin";

const PAGES = [
  { path: "/tr", h1: /Mezbaha, kurban ve robotik/ },
  { path: "/tr/kategori/tum-urunler", h1: /Tüm Ürünler/ },
  { path: "/tr/kategori/tum-urunler/2", h1: /Tüm Ürünler/ },
  { path: "/tr/urun/dairesel-kesim-hucresi", h1: /Dairesel Kesim Hücresi/ },
  { path: "/tr/sayfa/kurumsal", h1: /Kurumsal/ },
  { path: "/tr/iletisim", h1: /İletişim/ },
  { path: "/", h1: /Slaughterhouse, sacrifice/ },
  { path: "/category/all-products", h1: /All Products/ },
  { path: "/product/circular-slaughter-cell", h1: /Circular Slaughter Cell/ },
  { path: "/de/produkt/rundschlachtbox", h1: /Rundschlachtbox/ },
  { path: "/fr/categorie/equipements-dabattoir", h1: /Équipements d'abattoir/ },
  { path: "/ru/kategoriya/vse-produkty", h1: /Все продукты/ },
  { path: "/ar", h1: /معدات المسالخ/ },
  { path: "/ar/category/all-products", h1: /جميع المنتجات/ },
  { path: "/tr/arama?q=testere", h1: /Arama/ },
];
const WIDTHS = [320, 375, 768, 1024, 1440];

test.describe("storefront renders without horizontal overflow", () => {
  for (const p of PAGES) {
    test(`${p.path}`, async ({ page }) => {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const res = await page.goto(p.path);
        expect(res?.status()).toBe(200);
        await expect(page.locator("h1").first()).toHaveText(p.h1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test("Arabic is RTL and the mobile drawer opens from the right", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x + box!.width).toBeGreaterThan(385); // anchored to the right edge
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

// 2026-11: every language has its own product pages; a Turkish slug under another language is a real 404
test("every language has its own product pages; listings link to the same-language page", async ({ page, request }) => {
  expect((await request.get("/ru/produkt/krugovoy-boks-dlya-uboya")).status()).toBe(200);
  expect((await request.get("/ar/product/circular-slaughter-cell")).status()).toBe(200);
  expect((await request.get("/ru/produkt/dairesel-kesim-hucresi")).status()).toBe(404);
  await page.goto("/ru/kategoriya/vse-produkty");
  await expect(page.locator('main a[href="/ru/produkt/krugovoy-boks-dlya-uboya"]').first()).toBeVisible();
  await page.goto("/de/produkt/rundschlachtbox");
  const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => e.getAttribute("hreflang")).sort());
  expect(alternates).toEqual(["ar", "de", "en", "fr", "ru", "tr", "x-default"]);
});

test("product gallery lightbox: keyboard, Esc, focus trap", async ({ page }) => {
  await page.goto("/tr/urun/dairesel-kesim-hucresi");
  await page.getByRole("button", { name: /Görseli büyüt/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("mega menu opens, closes with Esc and returns focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tr");
  const trigger = page.getByRole("navigation", { name: "Ana menü" }).getByRole("button", { name: "Ürünler" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("legacy URLs redirect in a single hop", async ({ request }) => {
  const cases: [string, string, number][] = [
    ["/lang-eng/", "/", 301],
    ["/urun/circular-cutting-cell", "/category/all-products", 301], // old site's English product URL
    ["/kategori/tum-urunler/1", "/tr/kategori/tum-urunler", 301],
    ["/urun/dairesel-kesim-hucresi", "/tr/urun/dairesel-kesim-hucresi", 301], // pre-2026-11 Turkish URL
    ["/tr/", "/tr", 308],
    ["/en/category/all-products", "/category/all-products", 308],
  ];
  for (const [from, to, status] of cases) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect(res.status(), from).toBe(status);
    expect(new URL(res.headers().location!, "http://localhost:3460").pathname, from).toBe(to);
    const next = await request.get(to, { maxRedirects: 0 });
    expect(next.status(), `${to} must be final`).toBe(200);
  }
});

test("unknown URLs are real 404s (legacy site answered 200)", async ({ request }) => {
  expect((await request.get("/tr/urun/olmayan-bir-urun")).status()).toBe(404);
  expect((await request.get("/product/nope")).status()).toBe(404);
});

test("staging is not indexable", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
});

test.describe("admin", () => {
  test("is protected and noindex", async ({ request, page }) => {
    const res = await request.get("/admin", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/admin/login");
    await page.goto("/admin/login");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("rejects a wrong password with a generic message", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("E-posta").fill("nobody@kornne.test");
    await page.getByLabel("Şifre").fill("wrong-password-123");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "hatalı" })).toHaveText("E-posta veya şifre hatalı.");
  });

  test("a real admin session reaches the dashboard and can log out", async ({ page }) => {
    const admin = readTestAdmin();
    await page.goto("/admin/login");
    await page.getByLabel("E-posta").fill(admin.email);
    await page.getByLabel("Şifre").fill(admin.password);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hoş geldiniz");
    await page.goto("/admin/products");
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("button", { name: "Çıkış" }).first().click();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
