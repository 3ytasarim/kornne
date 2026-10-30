import { expect, test, type Page } from "@playwright/test";
import { cleanupE2eWrites } from "./cleanup";

/**
 * Sprint 10 — consent + analytics on the prod-like build (ANALYTICS_ENABLED with a FAKE id "G-KORNNETEST0").
 * Every request to a Google host is intercepted and ABORTED: nothing ever leaves this machine. We assert on what the
 * page would have sent (window.dataLayer) and on which scripts it tried to load.
 */
const GOOGLE = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net/;
test.afterEach(async () => cleanupE2eWrites());

async function watchGoogle(page: Page) {
  const hits: string[] = [];
  await page.route(GOOGLE, (route) => {
    hits.push(route.request().url());
    return route.abort();
  });
  return hits;
}
/** dataLayer as plain JSON (gtag pushes Arguments objects). */
const dataLayer = (page: Page) =>
  page.evaluate(() => (window.dataLayer ?? []).map((x) => (x && typeof x === "object" && "length" in (x as object) && !Array.isArray(x) ? Array.prototype.slice.call(x) : x)) as unknown[]);
const events = async (page: Page) => (await dataLayer(page)).filter((x): x is [string, string, Record<string, unknown>] => Array.isArray(x) && x[0] === "event");

test.describe("consent banner (Consent Mode v2, basic mode)", () => {
  test("first visit: banner, focus on a choice, no Google script, no cookie, no dataLayer", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto("/");
    const banner = page.getByTestId("consent-banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("heading", { name: "Çerez tercihleri" })).toBeVisible();
    await expect(banner.getByText("Bu metin hukuki onay sürecindedir.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yalnız zorunlu" })).toBeFocused();
    await page.waitForTimeout(500);
    expect(hits).toEqual([]);
    expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
    expect((await page.context().cookies()).find((c) => c.name === "kornne_consent")).toBeUndefined();
  });

  test("reject: cookie a0, nothing loaded now or on the next visit", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Yalnız zorunlu" }).click();
    await expect(page.getByTestId("consent-banner")).toBeHidden();
    const cookie = (await page.context().cookies()).find((c) => c.name === "kornne_consent");
    expect(cookie?.value).toMatch(/^v1\.a0\.m0\.\d+$/);
    expect(cookie?.sameSite).toBe("Lax");
    await page.goto("/urun/dairesel-kesim-hucresi");
    await expect(page.getByTestId("consent-banner")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(hits).toEqual([]);
    expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
  });

  test("accept: defaults denied THEN update granted, script requested (aborted), PII-free page_view / view_item", async ({ page }) => {
    const hits = await watchGoogle(page);
    await page.goto("/arama?q=kesim");
    await page.getByRole("button", { name: "Tümünü kabul et" }).click();
    await expect.poll(() => hits.some((u) => u.includes("gtag/js?id=G-KORNNETEST0"))).toBe(true);
    const dl = await dataLayer(page);
    const consent = dl.filter((x): x is unknown[] => Array.isArray(x) && x[0] === "consent");
    expect(consent[0]).toEqual(["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", wait_for_update: 500 }]);
    expect(consent[1]).toEqual(["consent", "update", { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" }]);
    const pv = (await events(page)).find((e) => e[1] === "page_view");
    expect(pv?.[2].page_location).toBe("http://localhost:3471/arama"); // no query string
    await page.goto("/urun/dairesel-kesim-hucresi");
    await expect.poll(async () => (await events(page)).map((e) => e[1])).toEqual(expect.arrayContaining(["page_view", "view_item"]));
    const vi = (await events(page)).find((e) => e[1] === "view_item")!;
    expect(vi[2]).toMatchObject({ items: [expect.objectContaining({ item_id: expect.stringMatching(/^\d+$/), item_name: "Dairesel Kesim Hücresi" })] });
    expect(JSON.stringify(await dataLayer(page))).not.toMatch(/purchase|begin_checkout|add_payment_info|"price"|"value"|"currency"/);
  });

  test("search terms that look personal are dropped; analytics-only choice keeps ad signals denied", async ({ page }) => {
    await watchGoogle(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Tercihleri ayarla" }).click();
    await page.getByRole("checkbox", { name: /Analitik/ }).check();
    await page.getByRole("button", { name: "Seçimi kaydet" }).click();
    const consent = (await dataLayer(page)).filter((x): x is unknown[] => Array.isArray(x) && x[0] === "consent");
    expect(consent[1]).toEqual(["consent", "update", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    await page.goto(`/arama?q=${encodeURIComponent("ali.veli@example.com")}`);
    await expect.poll(async () => (await events(page)).some((e) => e[1] === "search")).toBe(true);
    const s = (await events(page)).find((e) => e[1] === "search")!;
    expect(s[2]).not.toHaveProperty("search_term");
    expect(JSON.stringify(await dataLayer(page))).not.toContain("example.com");
  });

  test("generate_lead exactly once per stored quote (double click), without any personal data or the reference", async ({ page }) => {
    test.setTimeout(90_000);
    await watchGoogle(page);
    await page.goto("/urun/hijyen-geciti");
    await page.getByRole("button", { name: "Tümünü kabul et" }).click();
    await page.getByRole("button", { name: /^(Teklif listesine ekle|Sepete ekle)$/ }).click();
    await expect.poll(async () => (await events(page)).some((e) => e[1] === "add_to_quote_list")).toBe(true);
    await page.goto("/teklif-listem");
    const email = `e2e-lead-${Date.now()}@kornne.test`;
    await page.getByLabel("Ad soyad").fill("E2E Analitik");
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Notunuz (isteğe bağlı)").fill("Bu not analitiğe gitmemeli 0532 000 00 00");
    await page.waitForTimeout(2100);
    await page.getByRole("button", { name: "Teklif talebini gönder" }).dblclick();
    const ref = (await page.getByTestId("quote-reference").textContent())!.trim();
    await expect.poll(async () => (await events(page)).filter((e) => e[1] === "generate_lead").length).toBe(1);
    const lead = (await events(page)).find((e) => e[1] === "generate_lead")!;
    expect(lead[2]).toEqual({ lead_source: "quote_list", items_count: 1 });
    const all = JSON.stringify(await dataLayer(page));
    for (const secret of [email, "E2E Analitik", "0532", ref, "Bu not"]) expect(all).not.toContain(secret);
  });

  test("withdrawal from the footer: consent update denied, _ga cookies removed, choice persists", async ({ page, context }) => {
    await watchGoogle(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Tümünü kabul et" }).click();
    await context.addCookies([{ name: "_ga", value: "GA1.1.test", url: "http://localhost:3471" }]);
    await page.getByRole("contentinfo").getByRole("button", { name: "Çerez tercihleri" }).click();
    await expect(page.getByRole("checkbox", { name: /Analitik/ })).toBeChecked();
    await page.getByRole("checkbox", { name: /Analitik/ }).uncheck();
    await page.getByRole("checkbox", { name: /Pazarlama/ }).uncheck();
    await page.getByRole("button", { name: "Seçimi kaydet" }).click();
    const consent = (await dataLayer(page)).filter((x): x is unknown[] => Array.isArray(x) && x[0] === "consent");
    expect(consent.at(-1)).toEqual(["consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }]);
    expect((await context.cookies()).find((c) => c.name === "_ga")).toBeUndefined();
    expect((await context.cookies()).find((c) => c.name === "kornne_consent")?.value).toMatch(/^v1\.a0\.m0\./);
    const before = (await events(page)).length;
    // client-side navigation (same document, runtime still loaded) must not produce a page_view any more
    await page.getByRole("navigation", { name: "Ana menü" }).getByRole("link", { name: "Kurumsal" }).click();
    await page.waitForURL(/\/sayfa\/kurumsal/);
    await page.waitForTimeout(400);
    expect((await events(page)).length).toBe(before); // nothing tracked after withdrawal
  });

  test("Search Console verification meta + enforced CSP", async ({ request }) => {
    const res = await request.get("/");
    expect(await res.text()).toContain('<meta name="google-site-verification" content="kornne-test-verification-token-0000"/>');
    const csp = res.headers()["content-security-policy"];
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://www.googletagmanager.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
