import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildInitRequest } from "@/lib/commerce/card-payments";
import { authHeaders, iyzicoConfig, normalizePrice, priceToMinor, retrieveSignatureValid, safePaymentPageUrl, toPrice, webhookSignatureValid } from "@/lib/commerce/payments/iyzico";

const hex = (key: string, data: string) => createHmac("sha256", key).update(data).digest("hex");

describe("iyzico client", () => {
  it("is off unless enabled with both keys and an official base URL", () => {
    const ok = { ENABLE_CARD_PAYMENT: "true", IYZICO_API_KEY: "k", IYZICO_SECRET_KEY: "s", IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com/" };
    expect(iyzicoConfig(ok)).toMatchObject({ baseUrl: "https://sandbox-api.iyzipay.com", sandbox: true });
    expect(iyzicoConfig({ ...ok, ENABLE_CARD_PAYMENT: "false" })).toBeNull();
    expect(iyzicoConfig({ ...ok, IYZICO_SECRET_KEY: "" })).toBeNull();
    expect(iyzicoConfig({ ...ok, IYZICO_BASE_URL: "https://evil.example.com" })).toBeNull();
    expect(iyzicoConfig({ ...ok, IYZICO_BASE_URL: "https://api.iyzipay.com" })?.sandbox).toBe(false);
  });

  it("signs requests with IYZWSv2 (HMAC-SHA256 of randomKey + path + body, hex, base64 envelope)", () => {
    const h = authHeaders({ apiKey: "api", secretKey: "sec" }, "/payment/x", '{"a":1}', "RND123");
    expect(h["x-iyzi-rnd"]).toBe("RND123");
    expect(h.Authorization.startsWith("IYZWSv2 ")).toBe(true);
    const decoded = Buffer.from(h.Authorization.slice(8), "base64").toString("utf8");
    expect(decoded).toBe(`apiKey:api&randomKey:RND123&signature:${hex("sec", 'RND123/payment/x{"a":1}')}`);
  });

  it("formats and parses amounts exactly (minor units, no floats)", () => {
    expect(toPrice(835_700n)).toBe("8357.00");
    expect(toPrice(5n)).toBe("0.05");
    expect(priceToMinor(8357)).toBe(835_700n);
    expect(priceToMinor("8357.1")).toBe(835_710n);
    expect(priceToMinor("10.50")).toBe(1_050n);
    expect(priceToMinor("10.501")).toBeNull();
    expect(priceToMinor("-1")).toBeNull();
    expect(normalizePrice("50.00")).toBe("50");
    expect(normalizePrice("10.50")).toBe("10.5");
    expect(normalizePrice(12)).toBe("12");
  });

  it("verifies the retrieve response signature (prices without trailing zeros) and the webhook signature", () => {
    const r = { paymentStatus: "SUCCESS", paymentId: "123", currency: "USD", basketId: "KRN-1", conversationId: "c1", paidPrice: "8457.00", price: 8457, token: "tok" };
    const signature = hex("sec", "SUCCESS:123:USD:KRN-1:c1:8457:8457:tok");
    expect(retrieveSignatureValid("sec", { ...r, signature })).toBe(true);
    expect(retrieveSignatureValid("sec", { ...r, paidPrice: "1.00", signature })).toBe(false);
    expect(retrieveSignatureValid("other", { ...r, signature })).toBe(false);
    expect(retrieveSignatureValid("sec", r)).toBe(false);
    const b = { iyziEventType: "CHECKOUT_FORM_AUTH", iyziPaymentId: 9, token: "tok", paymentConversationId: "c1", status: "SUCCESS" };
    expect(webhookSignatureValid("sec", b, hex("sec", "secCHECKOUT_FORM_AUTH9tokc1SUCCESS"))).toBe(true);
    expect(webhookSignatureValid("sec", b, null)).toBe(false);
    expect(webhookSignatureValid("sec", { ...b, status: "FAILURE" }, hex("sec", "secCHECKOUT_FORM_AUTH9tokc1SUCCESS"))).toBe(false);
  });

  it("follows only iyzico's own payment pages", () => {
    expect(safePaymentPageUrl("https://sandbox-cpp.iyzipay.com?token=x")).toContain("iyzipay.com");
    expect(safePaymentPageUrl("https://cpp.iyzico.com/x")).toContain("iyzico.com");
    expect(safePaymentPageUrl("https://iyzico.com.evil.net/x")).toBeNull();
    expect(safePaymentPageUrl("http://cpp.iyzico.com/x")).toBeNull();
    expect(safePaymentPageUrl(undefined)).toBeNull();
  });

  it("builds a basket that adds up to the order total (shipping as its own item) and refuses a mismatch", () => {
    const order = { id: "o1", number: "KRN-261117-ABCDE", currency: "USD", totalMinor: 845_700n, shippingMinor: 10_000n, billing: { company: "ACME Inc", taxNumber: "US-99", name: "John Smith", email: "j@x.test", phone: "+1 (555) 010-2000", city: "Austin", district: "United States", address: "1 Main St" }, shipping: { sameAsBilling: true }, items: [{ id: "i1", titleSnapshot: "Carcass Halving Saw", lineTotalMinor: 835_700n }] };
    const req = buildInitRequest(order, { attemptId: "a1", callbackUrl: "https://kornne.com/api/v1/payments/iyzico/callback", ip: "1.2.3.4" });
    expect(req).toMatchObject({ locale: "en", conversationId: "a1", basketId: order.number, price: "8457.00", paidPrice: "8457.00", currency: "USD", enabledInstallments: [1] });
    expect(req.basketItems.map((i) => i.price)).toEqual(["8357.00", "100.00"]);
    expect(req.buyer).toMatchObject({ name: "John", surname: "Smith", identityNumber: "11111111111", country: "United States", city: "Austin", gsmNumber: "+15550102000", ip: "1.2.3.4" });
    expect(req.billingAddress.contactName).toBe("ACME Inc");
    expect(buildInitRequest({ ...order, currency: "TRY", billing: { ...order.billing, taxNumber: "1234567890" } }, { attemptId: "a", callbackUrl: "https://x" }).buyer).toMatchObject({ identityNumber: "1234567890", country: "Turkey" });
    expect(() => buildInitRequest({ ...order, totalMinor: 1n }, { attemptId: "a", callbackUrl: "https://x" })).toThrow(/basket/);
  });
});
