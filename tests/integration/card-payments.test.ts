import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmBankTransfer, placeBankTransferOrder, type B2BCheckoutInput } from "@/lib/commerce/b2b-orders";
import { finalizeCardPayment, startCardPayment } from "@/lib/commerce/card-payments";
import { commerceGate, TEST_COMMERCE_ENV } from "@/lib/commerce/gate";
import { normalizePrice, type IyzicoConfig, type RetrieveResult } from "@/lib/commerce/payments/iyzico";
import { cleanupTestSchema, hasTestDb, makeProduct, makeUser, testDb } from "./test-schema";

/**
 * iyzico card payments in the ISOLATED test DB with a fake iyzico (no network): an order becomes PAID only after a
 * signed, matching retrieve result; declines keep it open, fraud review waits, mismatches fail it, replays change nothing.
 */
describe.skipIf(!hasTestDb)("Card payments via iyzico (isolated test DB, fake provider)", () => {
  const db = testDb();
  const gate = commerceGate({ ...TEST_COMMERCE_ENV, PAYMENT_PROVIDER: "bank_transfer" });
  const cfg: IyzicoConfig = { apiKey: "sandbox-api", secretKey: "sandbox-secret", baseUrl: "https://sandbox-api.iyzipay.com", sandbox: true };
  const rates = { USD: 341_234, EUR: 370_123 };
  let ref = "";
  const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
  let next: Partial<RetrieveResult> & { sign?: boolean } = {};

  const sign = (r: RetrieveResult) => createHmac("sha256", cfg.secretKey).update([r.paymentStatus, r.paymentId, r.currency, r.basketId, r.conversationId, normalizePrice(r.paidPrice), normalizePrice(r.price), r.token].map((x) => String(x ?? "")).join(":")).digest("hex");
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ url, auth: String((init.headers as Record<string, string>).Authorization), body });
    if (url.endsWith("/initialize/auth/ecom")) return new Response(JSON.stringify({ status: "success", token: `tok-${randomUUID()}`, paymentPageUrl: "https://sandbox-cpp.iyzipay.com?token=x", conversationId: body.conversationId }));
    const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { providerRef: String(body.token) }, include: { order: true } });
    const r: RetrieveResult = { status: "success", paymentStatus: "SUCCESS", fraudStatus: 1, paymentId: "99001", currency: attempt.currency, basketId: attempt.order.number, conversationId: attempt.id, price: Number(attempt.amountMinor) / 100, paidPrice: Number(attempt.amountMinor) / 100, token: String(body.token), cardAssociation: "VISA", lastFourDigits: "0008", ...next };
    return new Response(JSON.stringify({ ...r, signature: next.sign === false ? "00" : sign(r) }));
  }) as unknown as typeof fetch;

  const input = (over: Partial<B2BCheckoutInput> = {}): B2BCheckoutInput => ({
    locale: "en",
    company: "ACME Meat Inc",
    taxOffice: "",
    taxNumber: "US-123456",
    contactName: "John Smith",
    email: "buyer@kornne.test",
    phone: "+1 555 010 2000",
    city: "Austin",
    district: "United States",
    address: "1 Main Street, TX 78701",
    shippingSame: true,
    acceptTerms: true,
    items: [{ productRef: ref, variantId: null, quantity: 1 }],
    idempotencyKey: randomUUID(),
    startedAt: Date.now() - 10_000,
    paymentMethod: "CARD",
    ...over,
  });
  const place = async () => {
    const r = await placeBankTransferOrder(db, gate, input(), { ipHash: null, isTest: true, rates, cardEnabled: true });
    if (!r.ok) throw new Error(`place failed: ${r.code}`);
    return r;
  };
  const start = async (orderId: string) => {
    const s = await startCardPayment(db, cfg, orderId, { siteUrl: "https://kornne.test", ip: "203.0.113.5" }, fakeFetch);
    if (!s.ok) throw new Error(`start failed: ${s.code}`);
    return (await db.paymentAttempt.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" } })).providerRef;
  };

  beforeAll(async () => {
    await cleanupTestSchema(db);
    await db.bankAccount.deleteMany({});
    await db.loginAttempt.deleteMany({ where: { key: { startsWith: "order" } } });
    ref = (await makeProduct(db, { priceStatus: "VERIFIED", amountMinor: 120_000_00n, vatIncluded: true, vatRateBp: 2000 })).ref;
  });
  afterAll(async () => {
    await db.loginAttempt.deleteMany({ where: { key: { startsWith: "order" } } });
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  it("card orders need card payment configured; a USD card order needs no USD bank account", async () => {
    expect(await placeBankTransferOrder(db, gate, input(), { ipHash: null, isTest: true, rates, cardEnabled: false })).toEqual({ ok: false, code: "closed" });
    const r = await place();
    expect(r).toMatchObject({ paymentMethod: "CARD", currency: "USD" });
    const o = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(o).toMatchObject({ status: "AWAITING_PAYMENT", paymentMethod: "CARD", shippingMinor: 100_00n });
  });

  it("opens iyzico's page with a signed request whose basket equals the order total", async () => {
    const r = await place();
    calls.length = 0;
    await start(r.orderId);
    const init = calls[0]!;
    expect(init.url).toBe("https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom");
    expect(init.auth.startsWith("IYZWSv2 ")).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(init.body).toMatchObject({ basketId: o.number, currency: "USD", callbackUrl: "https://kornne.test/api/v1/payments/iyzico/callback" });
    const items = init.body.basketItems as { price: string }[];
    expect(items.reduce((s, i) => s + Math.round(Number(i.price) * 100), 0)).toBe(Number(o.totalMinor));
  });

  it("declined → order stays open; retry → fraud review waits → approved → PAID once (replay changes nothing)", async () => {
    const r = await place();
    next = { status: "failure", paymentStatus: "FAILURE", errorCode: "10051", errorMessage: "Insufficient funds" };
    const t1 = await start(r.orderId);
    expect((await finalizeCardPayment(db, cfg, t1, fakeFetch)).outcome).toBe("failed");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe("AWAITING_PAYMENT");
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { providerRef: t1 } })).status).toBe("FAILED");

    const t2 = await start(r.orderId);
    next = { fraudStatus: 0 };
    expect((await finalizeCardPayment(db, cfg, t2, fakeFetch)).outcome).toBe("review");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe("AWAITING_PAYMENT");
    // a transfer cannot be confirmed by hand while the card payment is under review
    const admin = await makeUser(db, "ADMIN");
    await expect(confirmBankTransfer(db, admin, r.orderId, "dekont kontrol")).rejects.toThrow(/iyzico/);

    next = {};
    const done = await finalizeCardPayment(db, cfg, t2, fakeFetch);
    expect(done).toMatchObject({ outcome: "paid", orderNumber: (await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).number, locale: "en" });
    const o = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { statusEvents: true } });
    expect(o).toMatchObject({ status: "PAID", paymentStatus: "PAID" });
    expect(o.statusEvents.find((e) => e.toStatus === "PAID")?.reason).toContain("VISA ****0008");
    expect((await finalizeCardPayment(db, cfg, t2, fakeFetch)).outcome).toBe("paid");
    expect(await db.orderStatusEvent.count({ where: { orderId: r.orderId, toStatus: "PAID" } })).toBe(1);
    expect((await startCardPayment(db, cfg, r.orderId, { siteUrl: "https://kornne.test" }, fakeFetch)).ok).toBe(false); // paid → no new attempt
  });

  it("a bad signature changes nothing; a wrong amount fails the order (never shipped)", async () => {
    const r = await place();
    const t = await start(r.orderId);
    next = { sign: false };
    expect((await finalizeCardPayment(db, cfg, t, fakeFetch)).outcome).toBe("invalid");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe("AWAITING_PAYMENT");
    next = { paidPrice: 1, price: 1 };
    expect((await finalizeCardPayment(db, cfg, t, fakeFetch)).outcome).toBe("mismatch");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe("FAILED");
    expect((await finalizeCardPayment(db, cfg, "not-a-real-token-123", fakeFetch)).outcome).toBe("unknown");
    expect(await db.paymentWebhookEvent.count({ where: { provider: "iyzico", outcome: "amount_mismatch" } })).toBe(1);
    next = {};
  });
});
