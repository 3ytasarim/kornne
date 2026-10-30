import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACTIONS, allowed } from "@/lib/auth/rbac";
import { createMerchantClient, HttpMerchantClient, merchantApiStatus, parseError, ServiceAccountTokenProvider, withRetry } from "@/lib/merchant/api/client";
import { MockMerchantClient } from "@/lib/merchant/api/mock";
import { inputHash, toMicros, toProductInput } from "@/lib/merchant/api/transform";
import { MerchantApiError, MerchantDisabledError } from "@/lib/merchant/api/types";
import type { Evaluated } from "@/lib/merchant/facts";
import { buildFeed, feedCsv, feedTsv, feedXml, FeedRefusal, toFeedItem } from "@/lib/merchant/feed";
import { parseCsv, readMappingRows } from "@/lib/merchant/mapping";
import { evaluateReadiness, validGtin, type MerchantContext, type ProductFacts } from "@/lib/merchant/readiness";

/** A product that satisfies every gate — TEST FIXTURE values, never real catalog data. */
const good = (o: Partial<ProductFacts> = {}): ProductFacts => ({
  id: "p1", ref: "9900001", status: "PUBLISHED", needsReview: false, saleMode: "CART_AND_QUOTE", title: "TEST Ürün", descriptionText: "TEST açıklama ".repeat(20), targetTranslationPublished: true,
  price: { amountMinor: 120000n, currency: "TRY", status: "VERIFIED", vatIncluded: true, compareAtMinor: null }, pagePriceMinor: 120000n, availability: "IN_STOCK",
  gtin: "4006381333931", mpn: null, identifierExists: null, brandVerified: true, googleProductCategory: "5", mainImage: { width: 1600, height: 1600, mime: "image/jpeg", suspect: false }, offerIdMapped: true, ...o,
});
const ctx = (o: Partial<MerchantContext> = {}): MerchantContext => ({ targetCountry: "TR", contentLanguage: "tr", feedLabel: "TR", currency: "TRY", siteIndexable: true, catalogVerified: true, targetLocaleIsSeo: true, checkoutOpen: true, shippingVerified: true, returnsVerified: true, businessVerified: true, now: new Date("2026-10-22T00:00:00Z"), ...o });
const codes = (p: ProductFacts, c = ctx()) => evaluateReadiness(p, c).reasons.filter((r) => r.severity === "blocking").map((r) => r.code);
const ev = (p: ProductFacts, c = ctx()): Evaluated => ({ ...p, ...evaluateReadiness(p, c), link: "http://localhost:3471/urun/test", imageLink: "http://localhost:3471/upload/a.jpg", additionalImageLinks: [], descriptionHtml: "", condition: "new", brandName: "TESTBRAND", productType: null, offerId: `kornne-${p.ref}`, mappedOfferId: null });

describe("Merchant readiness engine", () => {
  it("READY only when every gate passes with verified data", () => {
    expect(evaluateReadiness(good(), ctx()).status).toBe("READY");
  });

  it.each([
    ["unverified price", good({ price: { amountMinor: 120000n, currency: "TRY", status: "UNVERIFIED", vatIncluded: true, compareAtMinor: null }, pagePriceMinor: null }), "PRICE_UNVERIFIED"],
    ["no price", good({ price: null, pagePriceMinor: null }), "PRICE_MISSING"],
    ["0 TL", good({ price: { amountMinor: 0n, currency: "TRY", status: "VERIFIED", vatIncluded: true, compareAtMinor: null }, pagePriceMinor: 0n }), "PRICE_ZERO"],
    ["VAT unknown", good({ price: { amountMinor: 100n, currency: "TRY", status: "VERIFIED", vatIncluded: null, compareAtMinor: null }, pagePriceMinor: 100n }), "VAT_UNKNOWN"],
    ["invalid discount", good({ price: { amountMinor: 100n, currency: "TRY", status: "VERIFIED", vatIncluded: true, compareAtMinor: 90n }, pagePriceMinor: 100n }), "SALE_PRICE_INVALID"],
    ["page price differs", good({ pagePriceMinor: 99n }), "PRICE_NOT_ON_PAGE"],
    ["wrong currency", good({ price: { amountMinor: 100n, currency: "EUR", status: "VERIFIED", vatIncluded: true, compareAtMinor: null }, pagePriceMinor: 100n }), "CURRENCY_MISMATCH"],
    ["stock unknown", good({ availability: "UNKNOWN" }), "AVAILABILITY_UNKNOWN"],
    ["no stock row", good({ availability: null }), "AVAILABILITY_UNKNOWN"],
    ["GTIN bad check digit", good({ gtin: "4006381333932" }), "IDENTIFIER_MISSING"],
    ["no identifiers", good({ gtin: null, mpn: null, identifierExists: null }), "IDENTIFIER_MISSING"],
    ["brand unverified", good({ brandVerified: false }), "BRAND_UNVERIFIED"],
    ["quote only", good({ saleMode: "QUOTE_ONLY" }), "SALE_MODE_QUOTE_ONLY"],
    ["held for review (#208)", good({ needsReview: true }), "PRODUCT_NOT_PUBLIC"],
    ["no translation", good({ targetTranslationPublished: false }), "LANGUAGE_NOT_PUBLISHED"],
    ["no image", good({ mainImage: null }), "IMAGE_MISSING"],
    ["tiny image", good({ mainImage: { width: 90, height: 90, mime: "image/jpeg", suspect: false } }), "IMAGE_TOO_SMALL"],
    ["svg image", good({ mainImage: { width: 900, height: 900, mime: "image/svg+xml", suspect: false } }), "IMAGE_FORMAT"],
    ["phone in description", good({ descriptionText: "Detay için 0 532 111 22 33 arayın. " + "x ".repeat(100) }), "DESCRIPTION_POLICY"],
  ])("%s → BLOCKED", (_n, p, code) => {
    expect(codes(p)).toContain(code);
  });

  it.each([
    ["target not confirmed", ctx({ targetCountry: null }), "TARGET_UNSET"],
    ["site not live", ctx({ siteIndexable: false }), "SITE_NOT_LIVE"],
    ["checkout closed", ctx({ checkoutOpen: false }), "CHECKOUT_CLOSED"],
    ["shipping", ctx({ shippingVerified: false }), "SHIPPING_UNVERIFIED"],
    ["returns", ctx({ returnsVerified: false }), "RETURNS_UNVERIFIED"],
    ["business identity", ctx({ businessVerified: false }), "BUSINESS_IDENTITY_UNVERIFIED"],
    ["landing noindex", ctx({ targetLocaleIsSeo: false }), "LANDING_NOT_INDEXABLE"],
  ])("environment: %s → BLOCKED", (_n, c, code) => {
    expect(codes(good(), c)).toContain(code);
  });

  it("500 px rule: warning before 31 Jan 2027, blocking from that date; identifier_exists=no needs no fake barcode", () => {
    const small = good({ mainImage: { width: 225, height: 225, mime: "image/jpeg", suspect: false } });
    expect(evaluateReadiness(small, ctx()).status).toBe("READY");
    expect(evaluateReadiness(small, ctx()).reasons.map((r) => r.code)).toContain("IMAGE_BELOW_2027");
    expect(codes(small, ctx({ now: new Date("2027-01-31T00:00:00Z") }))).toContain("IMAGE_BELOW_2027");
    expect(evaluateReadiness(good({ gtin: null, identifierExists: false }), ctx()).status).toBe("READY");
  });

  it("GTIN validation uses the GS1 check digit", () => {
    expect(validGtin("4006381333931")).toBe(true);
    expect(validGtin("4006381333932")).toBe(false);
    expect(validGtin("12345")).toBe(false);
  });
});

describe("feed builder", () => {
  it("contains only READY items; BLOCKED ones are listed with reasons", () => {
    const feed = buildFeed([ev(good()), ev(good({ id: "p2", ref: "9900002", availability: "UNKNOWN" }))], ctx());
    expect(feed.items.map((i) => i.id)).toEqual(["kornne-9900001"]);
    expect(feed.excluded).toEqual([expect.objectContaining({ offerId: "kornne-9900002", reasons: ["AVAILABILITY_UNKNOWN"] })]);
  });

  it("refuses a forged READY item without verified price or real stock (no 0 TL, no fake in_stock)", () => {
    const forged = { ...ev(good({ price: { amountMinor: 0n, currency: "TRY", status: "UNVERIFIED", vatIncluded: true, compareAtMinor: null } })), status: "READY" as const };
    expect(() => toFeedItem(forged, ctx())).toThrow(FeedRefusal);
    const noStock = { ...ev(good({ availability: "UNKNOWN" })), status: "READY" as const };
    expect(() => toFeedItem(noStock, ctx())).toThrow(FeedRefusal);
  });

  it("formats price/sale_price exactly and escapes XML / neutralises TSV/CSV formulas", () => {
    const p = good({ title: 'Kesim <Hücre> & "A"', price: { amountMinor: 150000n, currency: "TRY", status: "VERIFIED", vatIncluded: true, compareAtMinor: 180000n }, pagePriceMinor: 150000n, descriptionText: "=CMD()|x " + "a ".repeat(100) });
    const it_ = toFeedItem(ev(p), ctx());
    expect(it_.price).toBe("1800.00 TRY");
    expect(it_.sale_price).toBe("1500.00 TRY");
    const xml = feedXml([it_], { title: "KORNNE", link: "http://localhost", generatedAt: new Date(0) });
    expect(xml).toContain("<title>Kesim &lt;Hücre&gt; &amp; &quot;A&quot;</title>");
    expect(xml).toContain("<g:price>1800.00 TRY</g:price>");
    expect(xml).toContain("GÖNDERİLMEDİ");
    expect(feedTsv([it_]).split("\n")[1]).toContain("\t'=CMD()");
    expect(feedCsv([it_]).split("\n")[0]).toMatch(/^id,title,description,link,image_link/);
  });
});

describe("Merchant API adapter (products_v1)", () => {
  it("transforms to ProductInput with exact micros and enum values; only catalog fields (PII isolation)", async () => {
    expect(toMicros("1234.5 TRY")).toEqual({ amountMicros: "1234500000", currencyCode: "TRY" });
    expect(() => toMicros("0.00 TRY")).toThrow();
    const input = toProductInput(toFeedItem(ev(good()), ctx()));
    expect(input).toMatchObject({ offerId: "kornne-9900001", contentLanguage: "tr", feedLabel: "TR", productAttributes: { availability: "IN_STOCK", condition: "NEW", price: { amountMicros: "1200000000", currencyCode: "TRY" }, gtins: ["4006381333931"], brand: "TESTBRAND" } });
    const allowedKeys = ["title", "description", "link", "imageLink", "additionalImageLinks", "availability", "condition", "price", "salePrice", "brand", "gtins", "mpn", "identifierExists", "googleProductCategory", "productTypes"];
    expect(Object.keys(input.productAttributes).every((k) => allowedKeys.includes(k))).toBe(true);
    expect(JSON.stringify(input)).not.toMatch(/@|\+90|email|phone|telefon/i);
    expect(await inputHash(input)).toBe(await inputHash(JSON.parse(JSON.stringify(input))));
  });

  it("is DISABLED by default and cannot be constructed without every opt-in", () => {
    const s = merchantApiStatus("123", {});
    expect(s.enabled).toBe(false);
    expect(s.reasons.length).toBeGreaterThanOrEqual(4);
    expect(() => createMerchantClient("123", {})).toThrow(MerchantDisabledError);
    const almost = { MERCHANT_API_ENABLED: "true", MERCHANT_ACCOUNT_ALLOWLIST: "123", GOOGLE_SERVICE_ACCOUNT_EMAIL: "x@y", GOOGLE_SERVICE_ACCOUNT_KEY_FILE: "/k", SECRETS_ROTATION_CONFIRMED: "true", NODE_ENV: "test" };
    expect(merchantApiStatus("123", almost).reasons).toEqual(["test ortamı: yalnız MOCK"]);
    expect(merchantApiStatus("999", { ...almost, NODE_ENV: "production" }).reasons).toEqual(["hesap MERCHANT_ACCOUNT_ALLOWLIST içinde değil"]);
  });

  it("retries 429 / 5xx / timeouts with backoff (honouring Retry-After) and stops on 4xx", async () => {
    const sleeps: number[] = [];
    const sleep = async (ms: number) => void sleeps.push(ms);
    const mock = new MockMerchantClient().failNext(429, 500, "timeout");
    const target = { accountId: "1", dataSourceId: "2" };
    const input = toProductInput(toFeedItem(ev(good()), ctx()));
    await withRetry(() => mock.insertProductInput(target, input), { attempts: 4, baseMs: 100, maxMs: 1000, timeoutMs: 1000 }, sleep, () => 1);
    expect(mock.calls.map((c) => c.status)).toEqual([429, 500, "timeout", 200]);
    expect(sleeps).toEqual([10, 200, 400]); // Retry-After 10 ms, then 100·2¹, 100·2²
    const bad = new MockMerchantClient();
    await expect(withRetry(() => bad.insertProductInput(target, { ...input, offerId: "ü invalid" }), undefined, sleep)).rejects.toMatchObject({ httpStatus: 400, retryable: false });
    const down = new MockMerchantClient().failNext(503, 503, 503, 503);
    await expect(withRetry(() => down.insertProductInput(target, input), { attempts: 4, baseMs: 1, maxMs: 1, timeoutMs: 1 }, sleep)).rejects.toMatchObject({ httpStatus: 503 });
    expect(down.calls).toHaveLength(4);
  });

  it("mock: idempotency key dedupes, delete of a missing item is 404, auth failure is 401", async () => {
    const m = new MockMerchantClient();
    const t = { accountId: "1", dataSourceId: "2" };
    const input = toProductInput(toFeedItem(ev(good()), ctx()));
    await m.insertProductInput(t, input, { idempotencyKey: "k1" });
    await m.insertProductInput(t, input, { idempotencyKey: "k1" });
    expect(m.store.size).toBe(1);
    expect(m.calls.map((c) => c.op)).toEqual(["insert", "insert-dedup"]);
    await expect(m.deleteProductInput(t, { offerId: "nope", contentLanguage: "tr", feedLabel: "TR" })).rejects.toMatchObject({ httpStatus: 404 });
    m.authOk = false;
    await expect(m.listDataSources("1")).rejects.toMatchObject({ httpStatus: 401, googleStatus: "UNAUTHENTICATED" });
  });

  it("http client: correct endpoint, dataSource parameter, bearer token; google.rpc.Status errors parsed", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return seen.length === 1 ? Response.json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "quota" } }, { status: 429, headers: { "retry-after": "0" } }) : Response.json({ offerId: "kornne-9900001" });
    }) as unknown as typeof fetch;
    const c = new HttpMerchantClient({ token: async () => "TOKEN" }, fetchImpl, { attempts: 2, baseMs: 1, maxMs: 1, timeoutMs: 1000 }, async () => {});
    await c.insertProductInput({ accountId: "123", dataSourceId: "456" }, toProductInput(toFeedItem(ev(good()), ctx())));
    expect(seen[1]!.url).toBe("https://merchantapi.googleapis.com/products/v1/accounts/123/productInputs:insert?dataSource=accounts%2F123%2FdataSources%2F456");
    expect((seen[1]!.init.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
    const err = await parseError(Response.json({ error: { status: "INVALID_ARGUMENT", message: "offerId too long" } }, { status: 400 }));
    expect(err).toBeInstanceOf(MerchantApiError);
    expect(err).toMatchObject({ httpStatus: 400, googleStatus: "INVALID_ARGUMENT", retryable: false, message: "offerId too long" });
  });

  it("service-account token: RS256 JWT for the content scope, cached until expiry", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    let calls = 0;
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      calls++;
      const assertion = new URLSearchParams(String(init.body)).get("assertion")!;
      const [h, p, s] = assertion.split(".");
      expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s!, "base64url"))).toBe(true);
      expect(JSON.parse(Buffer.from(p!, "base64url").toString())).toMatchObject({ iss: "sa@test.iam", scope: "https://www.googleapis.com/auth/content", aud: "https://oauth2.googleapis.com/token" });
      return Response.json({ access_token: "AT", expires_in: 3600 });
    }) as unknown as typeof fetch;
    const tp = new ServiceAccountTokenProvider("sa@test.iam", privateKey, fetchImpl, () => 1_000_000);
    expect(await tp.token()).toBe("AT");
    expect(await tp.token()).toBe("AT");
    expect(calls).toBe(1);
  });
});

describe("old item_id CSV mapping preview", () => {
  it("parses comma / semicolon / tab CSV with quotes and finds the id column", () => {
    expect(parseCsv('id;title\n"a;1";"x ""y"""\n')).toEqual([["id", "title"], ["a;1", 'x "y"']]);
    expect(parseCsv("id\ttitle\nA\tB")).toEqual([["id", "title"], ["A", "B"]]);
    const { rows, errors } = readMappingRows("Item ID,Title,Link,Language,Feed label\n80,Kabin,https://kornne.com/urun/x,TR,tr\n");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ offerId: "80", language: "tr", feedLabel: "TR", line: 2 });
    expect(readMappingRows("name,price\nx,1").errors[0]).toMatch(/id/);
  });
});

describe("RBAC — SEO / Merchant", () => {
  it("SEO audit for SEO editors; Merchant preview/simulation only for admins; product editors excluded", () => {
    expect(allowed("SEO_EDITOR", "seo.audit")).toBe(true);
    expect(allowed("SEO_EDITOR", "seo.export")).toBe(true);
    expect(allowed("ORDER_OPERATOR", "seo.audit")).toBe(false);
    expect(allowed("PRODUCT_EDITOR", "merchant.preview")).toBe(false);
    expect(allowed("SEO_EDITOR", "merchant.simulate")).toBe(false);
    expect(allowed("ADMIN", "merchant.simulate")).toBe(true);
    expect(Object.keys(ACTIONS)).toEqual(expect.arrayContaining(["seo.audit", "seo.export", "media.audit", "merchant.preview", "merchant.simulate"]));
  });
});
