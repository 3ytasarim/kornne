import "dotenv/config";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createTestUser, readTestAdmin } from "./test-admin";
import { testDatabaseUrl } from "../test-db-url.mjs";

const db = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl("e2e") }) });

async function login(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Şifre").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function addFromProductPage(page: Page, path: string, qty = 1) {
  await page.goto(path);
  if (qty > 1) {
    const inc = page.locator("#quote-cta").getByRole("button", { name: "Adedi artır" });
    for (let i = 1; i < qty; i++) await inc.click();
  }
  await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Teklif listesine eklendi|Sepete eklendi/ })).toBeVisible();
}

test.describe("Sprint 4 — product detail", () => {
  test("premium layout with only real data", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tr/urun/dairesel-kesim-hucresi");
    await expect(page.getByRole("group", { name: "Ürün görselleri" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ürün bölümleri" })).toBeVisible();
    const facts = page.locator("#bilgiler");
    await expect(facts).toContainText("Ürün no");
    await expect(facts).toContainText("78");
    await expect(facts).toContainText("Doğrulanmış teknik tablo henüz yayınlanmadı");
    const text = (await page.locator("main").innerText()).toLowerCase();
    for (const banned of ["stokta", "kargoya hazır", "ücretsiz kargo", "kredi kartı", "pdf"]) expect(text, banned).not.toContain(banned);
    await expect(page.locator('a[href$=".pdf"]')).toHaveCount(0);
    // related products come from the same primary category
    await expect(page.locator("#benzer article")).toHaveCount(4);
  });

  test("a product with real options requires a choice before it is added", async ({ page }) => {
    await page.goto("/tr/urun/kucuk-bas-stoklama-kancasi");
    await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Bir seçenek seçin" })).toBeVisible();
    await page.getByText("8 li Kanca", { exact: true }).click();
    await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
    await page.goto("/tr/teklif-listem");
    await expect(page.getByText("Seçenek: 8 li Kanca")).toBeVisible();
  });

  test("gallery lightbox opens with keyboard and closes with Esc", async ({ page }) => {
    await page.goto("/tr/urun/dairesel-kesim-hucresi");
    await page.getByRole("button", { name: /Görseli büyüt/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("mobile sticky quote bar appears after scrolling and hides the WhatsApp bubble", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/tr/urun/dairesel-kesim-hucresi");
    const bar = page.getByRole("button", { name: "Teklif al" });
    await expect(bar).toBeHidden();
    // scroll until the real quote panel has fully left the viewport (top edge)
    await page.evaluate(() => {
      const r = document.getElementById("quote-cta")!.getBoundingClientRect();
      window.scrollBy(0, r.bottom + 200);
    });
    await expect(bar).toBeVisible();
    await expect(page.locator("[data-wa-fab]")).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Sprint 5 — quote list and live quote requests", () => {
  test("empty state", async ({ page }) => {
    await page.goto("/tr/teklif-listem");
    await expect(page.getByText("Teklif listeniz boş.")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("end-to-end: list → quantities → validation → request stored in Neon → visible to admin", async ({ page }) => {
    await addFromProductPage(page, "/tr/urun/dairesel-kesim-hucresi", 2);
    await addFromProductPage(page, "/tr/urun/sulu-sterilizator");
    await addFromProductPage(page, "/tr/urun/testere-serit");
    await page.goto("/tr/teklif-listem");
    await expect(page.getByRole("heading", { name: "3 ürün" })).toBeVisible();
    // quantity +/−, manual entry clamps, remove
    const first = page.getByRole("listitem").filter({ hasText: "Dairesel Kesim Hücresi" });
    await expect(first.getByRole("spinbutton")).toHaveValue("2");
    await first.getByRole("button", { name: "Adedi artır" }).click();
    await expect(first.getByRole("spinbutton")).toHaveValue("3");
    await first.getByRole("spinbutton").fill("-5");
    await expect(first.getByRole("spinbutton")).toHaveValue("1");
    await first.getByRole("spinbutton").fill("4");
    await page.getByRole("button", { name: "Listeden çıkar: Testere Şerit" }).click();
    await expect(page.getByRole("heading", { name: "2 ürün" })).toBeVisible();

    // validation (no contact) → field errors, nothing stored
    await page.getByLabel("Ad soyad").fill("E2E Teklif");
    await page.getByRole("button", { name: "Teklif talebini gönder" }).click();
    await expect(page.getByText("E-posta veya telefon girin.")).toBeVisible();

    const email = `e2e-quote-${Date.now()}@kornne.test`;
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Notunuz (isteğe bağlı)").fill("<img src=x onerror=alert(1)> kapasite 40 baş/saat");
    await page.waitForTimeout(2100); // the form refuses submissions faster than 2 s (bot heuristic)
    await page.getByRole("button", { name: "Teklif talebini gönder" }).click();
    const ref = (await page.getByTestId("quote-reference").textContent())!.trim();
    expect(ref).toMatch(/^TKL-\d{8}-[A-Z0-9]{6}$/);
    await expect(page.getByText("Teklif talebiniz alındı")).toBeVisible();
    expect(page.url()).not.toContain(encodeURIComponent(email)); // no PII in URLs
    expect(await page.content()).not.toMatch(/sipariş(iniz)? (alındı|tamamlandı)|ödendi/i);

    // stored once, with snapshots and no price
    const prisma = db();
    try {
      const q = await prisma.quoteRequest.findUniqueOrThrow({ where: { reference: ref }, include: { items: true } });
      expect(q.email).toBe(email);
      expect(q.items.map((i) => [i.titleSnapshot, i.quantity]).sort()).toEqual([["Dairesel Kesim Hücresi", 4], ["Sulu Sterilizatör", 1]]);
      expect(q.message).toContain("<img src=x onerror=alert(1)>");
    } finally {
      await prisma.$disconnect();
    }

    // list cleared after success
    await page.goto("/tr/teklif-listem");
    await expect(page.getByText("Teklif listeniz boş.")).toBeVisible();

    // admin sees it; the list has no PII, the detail is audited and renders the note as text
    const admin = readTestAdmin();
    await login(page, admin.email, admin.password);
    await page.goto("/admin/quotes");
    await expect(page.getByRole("link", { name: ref })).toBeVisible();
    expect(await page.locator("main").innerText()).not.toContain(email);
    await page.getByRole("link", { name: ref }).click();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("<img src=x onerror=alert(1)> kapasite 40 baş/saat")).toBeVisible();
    const prisma2 = db();
    try {
      const q = await prisma2.quoteRequest.findUniqueOrThrow({ where: { reference: ref } });
      expect(await prisma2.auditLog.count({ where: { action: "quote.viewed", entityId: q.id } })).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma2.$disconnect();
    }
  });

  test("double submit creates a single request", async ({ page }) => {
    await addFromProductPage(page, "/tr/urun/hijyen-geciti");
    await page.goto("/tr/teklif-listem");
    const email = `e2e-dbl-${Date.now()}@kornne.test`;
    await page.getByLabel("Ad soyad").fill("E2E Çift");
    await page.getByLabel("E-posta").fill(email);
    await page.waitForTimeout(2100);
    const btn = page.getByRole("button", { name: "Teklif talebini gönder" });
    await btn.dblclick();
    await expect(page.getByTestId("quote-reference")).toBeVisible();
    const prisma = db();
    try {
      expect(await prisma.quoteRequest.count({ where: { email } })).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });

  test("Arabic quote list is RTL and fits 375 px", async ({ page }) => {
    await addFromProductPage(page, "/tr/urun/sulu-sterilizator");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/ar/quote-list");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("قائمة عرض السعر");
    await expect(page.getByRole("button", { name: "إرسال طلب عرض السعر" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

// Sprint 12: the dev build runs with the LOCAL commerce env (EFT/Havale open); the locked state is covered by
// commerce-locked.prodlike.spec.ts. Card payment never exists.
test.describe("Sprint 5/12 — no card payment, cart pages render", () => {
  test("cart and checkout pages render without any card payment wording", async ({ page }) => {
    for (const path of ["/tr/sepetim", "/tr/odeme", "/cart", "/de/warenkorb", "/ar/checkout"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(/Kredi kartı|Kart numarası|CVV|credit card/i);
    }
  });

  test("payment webhook endpoint does not exist while locked", async ({ request }) => {
    const res = await request.post("/api/v1/payments/webhook/mock", { data: { id: "x" } });
    expect(res.status()).toBe(404);
  });
});

test.describe("Sprint 5 — access control", () => {
  test("quote PII needs the quotes module: a product editor is refused", async ({ page }) => {
    const editor = await createTestUser("PRODUCT_EDITOR");
    await login(page, editor.email, editor.password);
    await page.goto("/admin/quotes");
    await expect(page).toHaveURL(/\/admin\?denied=1$/);
    await expect(page.getByText("Bu modüle erişim yetkiniz yok.")).toBeVisible();
  });

  test("anonymous visitors cannot reach the quote inbox", async ({ request }) => {
    const res = await request.get("/admin/quotes", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers().location).toContain("/admin/login");
  });
});
