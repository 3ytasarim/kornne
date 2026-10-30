import { describe, expect, it } from "vitest";
import { analyticsConfig, analyticsCspHosts, siteVerificationToken } from "@/lib/analytics/config";
import { consentCookieString, consentModeState, CONSENT_DEFAULTS, parseConsent, readConsentCookie, serializeConsent } from "@/lib/analytics/consent";
import { cleanLocation, EVENTS, FORBIDDEN_EVENTS, looksPersonal, sanitizeEvent } from "@/lib/analytics/events";
import { buildCsp } from "@/lib/security/csp";

describe("event taxonomy + PII filter", () => {
  it("rejects unknown and commerce events (checkout is closed)", () => {
    for (const e of ["purchase", "begin_checkout", "add_payment_info", "add_to_cart", "made_up_event"]) expect(sanitizeEvent(e, {})).toBeNull();
    expect([...FORBIDDEN_EVENTS].some((e) => e in EVENTS)).toBe(false);
  });

  it("keeps only allow-listed parameters", () => {
    const ev = sanitizeEvent("generate_lead", { lead_source: "quote_list", items_count: 2, email: "a@b.com", phone: "+90 532 000 00 00", value: 1500, currency: "TRY", reference: "TKL-2026-0001" });
    expect(ev).toEqual({ name: "generate_lead", params: { lead_source: "quote_list", items_count: 2 } });
  });

  it("drops any value that looks like an e-mail, a phone number or a quote reference", () => {
    expect(looksPersonal("ali@example.com")).toBe(true);
    expect(looksPersonal("0532 123 45 67")).toBe(true);
    expect(looksPersonal("+90 (262) 502 18 94")).toBe(true);
    expect(looksPersonal("TKL-12345")).toBe(true);
    expect(looksPersonal("Dairesel Kesim Hücresi")).toBe(false);
    expect(looksPersonal("9900001")).toBe(false); // product ref (≤ 7 digits)
    expect(sanitizeEvent("search", { search_term: "ali@example.com", results_count: 0 })).toEqual({ name: "search", params: { results_count: 0 } });
    expect(sanitizeEvent("search", { search_term: "  kesim   hücresi " })!.params.search_term).toBe("kesim hücresi");
  });

  it("cleans items (allow-listed keys, truncated numbers, PII-free strings, max 25)", () => {
    const ev = sanitizeEvent("view_item_list", { item_list_id: "mezbaha", items: [...Array(30)].map((_, i) => ({ item_id: String(80 + i), item_name: i === 0 ? "x@y.com" : "Ürün", price: 10, index: i + 0.7 })) });
    expect(ev!.params.items).toHaveLength(25);
    expect((ev!.params.items as Record<string, unknown>[])[0]).toEqual({ item_id: "80", index: 0 });
    expect(JSON.stringify(ev)).not.toContain("price");
  });

  it("page_location is sent without query string or fragment", () => {
    expect(cleanLocation("https://kornne.com/arama?q=ali%40example.com#x")).toBe("https://kornne.com/arama");
    expect(sanitizeEvent("page_view", { page_location: "http://localhost:3471/teklif-listem?token=abc", page_title: "Teklif listem", language: "tr" })!.params).toEqual({ page_location: "http://localhost:3471/teklif-listem", page_title: "Teklif listem", language: "tr" });
  });
});

describe("consent cookie + Consent Mode v2", () => {
  const now = Date.UTC(2026, 9, 23);
  it("round-trips and expires; a new version asks again", () => {
    const raw = serializeConsent({ analytics: true, marketing: false }, now);
    expect(raw).toMatch(/^v1\.a1\.m0\.\d+$/);
    expect(parseConsent(raw, now)).toMatchObject({ analytics: true, marketing: false });
    expect(parseConsent(raw, now + 181 * 86_400_000)).toBeNull();
    expect(parseConsent(raw.replace("v1", "v0"), now)).toBeNull();
    expect(parseConsent("garbage", now)).toBeNull();
    expect(readConsentCookie(`a=1; kornne_consent=${raw}; b=2`)).toMatchObject({ analytics: true });
  });
  it("cookie attributes: Lax, 180 days, Secure only on https", () => {
    expect(consentCookieString({ analytics: false, marketing: false }, true, now)).toMatch(/Max-Age=15552000; Path=\/; SameSite=Lax; Secure$/);
    expect(consentCookieString({ analytics: false, marketing: false }, false, now)).not.toContain("Secure");
  });
  it("defaults deny all four signals; ads only with the marketing choice", () => {
    expect(CONSENT_DEFAULTS).toEqual({ analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(consentModeState({ analytics: true, marketing: false })).toEqual({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    expect(consentModeState({ analytics: true, marketing: true }).ad_user_data).toBe("granted");
  });
});

describe("analytics configuration (env only, off by default)", () => {
  it("is disabled without an explicit opt-in and a valid id", () => {
    expect(analyticsConfig({})).toMatchObject({ enabled: false, mode: null, id: null });
    expect(analyticsConfig({ ANALYTICS_GA4_MEASUREMENT_ID: "G-ABCDEF1234" }).enabled).toBe(false);
    expect(analyticsConfig({ ANALYTICS_ENABLED: "true" }).problems[0]).toMatch(/geçerli bir GA4\/GTM/);
    expect(analyticsConfig({ ANALYTICS_ENABLED: "true", ANALYTICS_GA4_MEASUREMENT_ID: "UA-123" }).enabled).toBe(false);
    expect(analyticsConfig({ ANALYTICS_ENABLED: "true", ANALYTICS_GA4_MEASUREMENT_ID: "G-ABCDEF1234" })).toMatchObject({ enabled: true, mode: "gtag", id: "G-ABCDEF1234" });
    expect(analyticsConfig({ ANALYTICS_ENABLED: "true", ANALYTICS_GA4_MEASUREMENT_ID: "G-ABCDEF1234", ANALYTICS_GTM_CONTAINER_ID: "GTM-ABC1234" }).mode).toBe("gtm");
  });
  it("Search Console token only when set and well-formed", () => {
    expect(siteVerificationToken({})).toBeNull();
    expect(siteVerificationToken({ GOOGLE_SITE_VERIFICATION: "<script>" })).toBeNull();
    expect(siteVerificationToken({ GOOGLE_SITE_VERIFICATION: "abcDEF123_-xyz" })).toBe("abcDEF123_-xyz");
  });
});

describe("Content-Security-Policy", () => {
  it("no external script host when analytics is off; Google tag hosts only when on", () => {
    const off = buildCsp({ NODE_ENV: "production" });
    expect(off).toMatch(/script-src 'self' 'unsafe-inline';/);
    expect(off).not.toContain("google");
    expect(off).toContain("frame-ancestors 'none'");
    expect(off).toContain("object-src 'none'");
    expect(off).not.toContain("unsafe-eval");
    const on = buildCsp({ NODE_ENV: "production", ANALYTICS_ENABLED: "true", ANALYTICS_GA4_MEASUREMENT_ID: "G-ABCDEF1234" });
    expect(on).toContain("script-src 'self' 'unsafe-inline' https://www.googletagmanager.com");
    expect(on).toContain("connect-src 'self' https://*.google-analytics.com");
    expect(analyticsCspHosts(analyticsConfig({})).script).toEqual([]);
  });
});
