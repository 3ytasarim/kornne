import { expect, test, type Locator } from "@playwright/test";
import pg from "pg";
import { cleanupE2eWrites } from "./cleanup";
import { login } from "./helpers";
import { createTestUser, readTestAdmin } from "./test-admin";
import { testDatabaseUrl } from "../test-db-url.mjs";

/**
 * Sprint 11 — pre-launch security regression on the isolated server (:3470, local DB copy). Covers headers, path
 * traversal, unauthenticated access, CSRF on server actions, role-based access (IDOR), reflected XSS, login lockout,
 * locked payment webhook and the closed Merchant feed. Writes only @kornne.test / TEST-NET rows (cleaned up).
 */
const BASE = "http://localhost:3470";
test.afterEach(async () => cleanupE2eWrites());
async function count(sql: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: testDatabaseUrl("e2e") });
  await c.connect();
  try {
    return Number((await c.query(sql, params)).rows[0].n);
  } finally {
    await c.end();
  }
}
const formFields = (form: Locator) => form.evaluate((f: HTMLFormElement) => Object.fromEntries(Array.from(new FormData(f).entries()).filter(([, v]) => typeof v === "string")) as Record<string, string>);

test("security headers on storefront, admin and API; no framework fingerprint", async ({ request }) => {
  for (const path of ["/", "/urun/dairesel-kesim-hucresi", "/admin/login", "/api/health"]) {
    const h = (await request.get(path)).headers();
    expect(h["content-security-policy"], path).toMatch(/default-src 'self'.*frame-ancestors 'none'.*object-src 'none'/);
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["x-content-type-options"], path).toBe("nosniff");
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"], path).toContain("camera=()");
    expect(h["x-powered-by"], path).toBeUndefined();
  }
  expect((await request.get("/admin/login")).headers()["cache-control"]).toContain("no-store");
});

test("path traversal / dotfiles under /upload are real 404s", async ({ request }) => {
  for (const p of ["/upload/..%2F..%2Fpackage.json", "/upload/%2e%2e/.env", "/upload/.env", "/upload/..%5C..%5C.env", "/upload/%00.jpg", "/upload/nope.svg"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(404);
    expect(await r.text(), p).not.toMatch(/DATABASE_URL|"dependencies"/);
  }
});

test("unauthenticated: admin pages redirect, exports and feeds are closed, webhook does not exist while checkout is locked", async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: BASE });
  for (const p of ["/admin", "/admin/products", "/admin/quotes", "/admin/users", "/admin/analytics"]) {
    const r = await anon.get(p, { maxRedirects: 0 });
    expect([302, 303, 307], p).toContain(r.status());
    expect(r.headers().location, p).toMatch(/\/admin\/login$/);
  }
  for (const p of ["/admin/quotes/export", "/admin/seo/qa/export", "/admin/merchant/feed/export"]) expect((await anon.get(p, { maxRedirects: 0 })).status(), p).not.toBe(200);
  expect((await anon.post("/api/v1/payments/webhook/mock", { data: { id: "x" } })).status()).toBe(404);
  expect((await anon.post("/api/v1/payments/webhook/iyzico", { data: { id: "x" } })).status()).toBe(404);
  await anon.dispose();
});

test("CSRF: a server action replayed from a foreign Origin is rejected and changes nothing", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const admin = readTestAdmin();
  await login(page, admin.email, admin.password);
  await page.goto("/admin/merchant/baglanti");
  const fields = await formFields(page.getByRole("form", { name: "SIMULATED çalıştır" }));
  const before = await count(`select count(*) n from "MerchantSyncRun"`);
  const res = await ctx.request.post(`${BASE}/admin/merchant/baglanti`, { multipart: fields, headers: { origin: "https://evil.example" }, maxRedirects: 0, failOnStatusCode: false });
  expect(res.status()).not.toBe(200);
  expect(await count(`select count(*) n from "MerchantSyncRun"`)).toBe(before);
  await ctx.close();
});

test("role boundaries (IDOR): other roles cannot open modules or records they are not entitled to", async ({ browser }) => {
  const seo = await createTestUser("SEO_EDITOR");
  const pe = await createTestUser("PRODUCT_EDITOR");
  for (const [user, paths] of [
    [seo, ["/admin/quotes", "/admin/pricing", "/admin/users", "/admin/settings", "/admin/merchant", "/admin/analytics"]],
    [pe, ["/admin/quotes", "/admin/users", "/admin/seo/qa", "/admin/audit"]],
  ] as const) {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await login(page, user.email, user.password);
    for (const p of paths) {
      await page.goto(p);
      await expect(page, `${user.email} ${p}`).toHaveURL(/\/admin\?denied=1$/);
    }
    // a direct record URL is refused as well (not just the list)
    await page.goto("/admin/quotes/cl00000000000000000000000");
    await expect(page).toHaveURL(/\/admin\?denied=1$/);
    await ctx.close();
  }
});

test("reflected XSS: hostile search terms render as text, no script runs", async ({ page }) => {
  let dialog = false;
  page.on("dialog", async (d) => {
    dialog = true;
    await d.dismiss();
  });
  await page.goto(`/arama?q=${encodeURIComponent('"><script>alert(1)</script><img src=x onerror=alert(2)>')}`);
  await page.waitForTimeout(500);
  expect(dialog).toBe(false);
  expect(await page.locator("img[src='x']").count()).toBe(0);
  await expect(page.getByRole("status")).toContainText("<script>alert(1)</script>");
});

test("admin login lockout after repeated failures (per account + IP), generic error, audited", async ({ playwright }) => {
  test.setTimeout(120_000);
  // TEST-NET IP so the lockout cannot affect the other tests' logins (Nginx overwrites X-Real-IP in production)
  const browser = await playwright.chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-real-ip": "203.0.113.77" } });
  const page = await ctx.newPage();
  const email = `e2e-lock-${Date.now()}@kornne.test`;
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  let last = "";
  const alert = page.getByRole("alert").filter({ hasText: /hatalı|Çok fazla/ });
  for (let i = 0; i < 6; i++) {
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre").fill(`wrong-password-${i}`);
    const posted = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login"));
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await posted;
    await expect(alert).toBeVisible();
    last = (await alert.textContent()) ?? "";
  }
  expect(last).toContain("Çok fazla hatalı deneme");
  expect(await count(`select count(*) n from "LoginAttempt" where key = $1`, [`email:${email}`])).toBeGreaterThanOrEqual(5);
  await browser.close();
});
