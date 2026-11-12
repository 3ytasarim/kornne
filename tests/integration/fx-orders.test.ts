import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commerceGate, TEST_COMMERCE_ENV } from "@/lib/commerce/gate";
import { placeBankTransferOrder, resolveCartLines, type B2BCheckoutInput } from "@/lib/commerce/b2b-orders";
import { saveBankAccount } from "@/lib/commerce/bank-accounts";
import { cleanupTestSchema, hasTestDb, makeProduct, makeUser, testDb } from "./test-schema";

/**
 * USD price entry (11.11.2026): Turkish orders are charged in TRY at the TCMB selling rate (frozen on the order),
 * other languages are charged in USD and need an active USD bank account. Rates come from FX_FIXTURE (no network).
 */
describe.skipIf(!hasTestDb)("multi-currency orders (isolated test DB)", () => {
  const db = testDb();
  const gate = commerceGate({ ...TEST_COMMERCE_ENV, PAYMENT_PROVIDER: "bank_transfer" });
  const rates = { USD: 501981, EUR: 563795 };
  let usdRef = "";
  const input = (over: Partial<B2BCheckoutInput> = {}): B2BCheckoutInput => ({
    locale: "tr",
    company: "Test Et Sanayi A.Ş.",
    taxOffice: "Gebze",
    taxNumber: "1234567890",
    contactName: "Test Kişi",
    email: "fx-buyer@kornne.test",
    phone: "+90 500 000 00 03",
    city: "Kocaeli",
    district: "Dilovası",
    address: "Test Mah. Test Sok. No: 1",
    shippingSame: true,
    acceptTerms: true,
    items: [{ productRef: usdRef, variantId: null, quantity: 2 }],
    idempotencyKey: randomUUID(),
    startedAt: Date.now() - 10_000,
    ...over,
  });

  beforeAll(async () => {
    await cleanupTestSchema(db);
    await db.paymentNotice.deleteMany({});
    await db.bankAccount.deleteMany({});
    await db.loginAttempt.deleteMany({ where: { key: { startsWith: "order" } } });
    const { product, ref } = await makeProduct(db, { priceStatus: "VERIFIED", amountMinor: 1000_00n, vatIncluded: true, vatRateBp: 2000 });
    await db.price.updateMany({ where: { productId: product.id }, data: { currency: "USD" } });
    usdRef = ref;
  });
  afterAll(async () => {
    await db.paymentNotice.deleteMany({});
    await db.bankAccount.deleteMany({});
    await db.loginAttempt.deleteMany({ where: { key: { startsWith: "order" } } });
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  it("a USD price is charged in TRY on Turkish pages with the rate frozen on the order", async () => {
    const cart = await resolveCartLines(db, [{ productRef: usdRef, variantId: null, quantity: 1 }], new Date(), { currency: "TRY", rates });
    expect(cart.ok && cart.lines[0]!.unitPriceMinor).toBe(50_198_10n);
    const r = await placeBankTransferOrder(db, gate, input(), { ipHash: null, isTest: true, rates });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.currency, r.totalMinor]).toEqual(["TRY", 100_396_20n]);
    const o = await db.order.findUniqueOrThrow({ where: { number: r.number } });
    expect([o.currency, o.fxCurrency, o.fxRate4]).toEqual(["TRY", "USD", 501981]);
    expect(o.shippingMinor).toBe(0n); // Turkish orders: no shipping line
  });

  it("other languages pay in USD — only once an active USD account exists", async () => {
    expect(await placeBankTransferOrder(db, gate, input({ locale: "en" }), { ipHash: null, isTest: true, rates })).toEqual({ ok: false, code: "no_account" });
    const admin = await makeUser(db, "ADMIN");
    await saveBankAccount(db, admin, { bankName: "Test USD Bank", accountHolder: "Mezbaha Teknolojileri A.Ş.", iban: "TR330006100519786457841326", currency: "USD", active: true });
    const r = await placeBankTransferOrder(db, gate, input({ locale: "de" }), { ipHash: null, isTest: true, rates });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.currency, r.totalMinor]).toEqual(["USD", 2100_00n]); // + flat USD 100 freight (client 12.11.2026)
    const o = await db.order.findUniqueOrThrow({ where: { number: r.number } });
    expect([o.currency, o.fxCurrency, o.fxRate4]).toEqual(["USD", null, null]); // no conversion needed
    // no VAT on foreign orders: the listed price is the whole amount (client 11.11.2026)
    expect([o.subtotalMinor, o.taxMinor, o.shippingMinor, o.totalMinor]).toEqual([2000_00n, 0n, 100_00n, 2100_00n]);
  });

  it("foreign orders take a company tax / VAT ID without a Turkish tax office; Turkish orders still need VKN/TCKN", async () => {
    const foreign = await placeBankTransferOrder(db, gate, input({ locale: "fr", taxOffice: "", taxNumber: "FR 12 345678901", email: "fx-foreign@kornne.test", city: "Lyon", district: "France" }), { ipHash: null, isTest: true, rates });
    expect(foreign.ok).toBe(true);
    const badForeign = await placeBankTransferOrder(db, gate, input({ locale: "en", taxOffice: "", taxNumber: "x!", email: "fx-foreign2@kornne.test" }), { ipHash: null, isTest: true, rates });
    expect(badForeign).toMatchObject({ ok: false, code: "validation", fields: { taxNumber: "invalidTaxNumber" } });
    const tr = await placeBankTransferOrder(db, gate, input({ taxOffice: "", taxNumber: "FR12345678901", email: "fx-tr@kornne.test" }), { ipHash: null, isTest: true, rates });
    expect(tr).toMatchObject({ ok: false, code: "validation", fields: { taxOffice: "required", taxNumber: "invalidTaxNumber" } });
  });

  it("Turkish orders keep the VAT breakdown; foreign carts carry no VAT", async () => {
    const trCart = await resolveCartLines(db, [{ productRef: usdRef, variantId: null, quantity: 1 }], new Date(), { currency: "TRY", rates });
    const enCart = await resolveCartLines(db, [{ productRef: usdRef, variantId: null, quantity: 1 }], new Date(), { currency: "USD", rates, locale: "en" });
    expect(trCart.ok && trCart.lines[0]!.vatRateBp).toBe(2000);
    expect(enCart.ok && [enCart.lines[0]!.vatRateBp, enCart.lines[0]!.unitPriceMinor]).toEqual([0, 1000_00n]);
  });

  it("without any rate a converted price is not purchasable (never a guessed amount)", async () => {
    const cart = await resolveCartLines(db, [{ productRef: usdRef, variantId: null, quantity: 1 }], new Date(), { currency: "TRY", rates: null });
    expect(cart.ok).toBe(false);
  });
});
