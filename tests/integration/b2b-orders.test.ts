import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commerceGate, TEST_COMMERCE_ENV } from "@/lib/commerce/gate";
import { confirmBankTransfer, lookupOrderStatus, placeBankTransferOrder, resolveCartLines, submitPaymentNotice, type B2BCheckoutInput } from "@/lib/commerce/b2b-orders";
import { listPublicBankAccounts, saveBankAccount } from "@/lib/commerce/bank-accounts";
import { cleanupTestSchema, hasTestDb, makeProduct, makeUser, testDb } from "./test-schema";

/**
 * Sprint 12 — B2B order by EFT/Havale in the ISOLATED local test DB: server re-pricing, idempotency, spam guards,
 * order lookup (number + e-mail), payment notice, admin confirmation, bank account validation.
 */
describe.skipIf(!hasTestDb)("B2B bank-transfer orders (isolated test DB)", () => {
  const db = testDb();
  const gate = commerceGate({ ...TEST_COMMERCE_ENV, PAYMENT_PROVIDER: "bank_transfer" });
  let verifiedRef = "";
  let unverifiedRef = "";
  let bankId = "";
  const VALID_IBAN = "TR330006100519786457841326";

  const input = (over: Partial<B2BCheckoutInput> = {}): B2BCheckoutInput => ({
    locale: "tr",
    company: "Test Et Sanayi A.Ş.",
    taxOffice: "Gebze",
    taxNumber: "1234567890",
    contactName: "Test Kişi",
    email: "buyer@kornne.test",
    phone: "+90 500 000 00 01",
    city: "Kocaeli",
    district: "Dilovası",
    address: "Test Mah. Test Sok. No: 1",
    shippingSame: true,
    acceptTerms: true,
    items: [{ productRef: verifiedRef, variantId: null, quantity: 2 }],
    idempotencyKey: randomUUID(),
    startedAt: Date.now() - 10_000,
    ...over,
  });

  beforeAll(async () => {
    await cleanupTestSchema(db);
    await db.paymentNotice.deleteMany({});
    await db.bankAccount.deleteMany({});
    await db.loginAttempt.deleteMany({ where: { key: { startsWith: "order" } } });
    verifiedRef = (await makeProduct(db, { priceStatus: "VERIFIED", amountMinor: 120_000_00n, vatIncluded: true, vatRateBp: 2000 })).ref;
    unverifiedRef = (await makeProduct(db, { priceStatus: "UNVERIFIED" })).ref;
    const admin = await makeUser(db, "ADMIN");
    bankId = (await saveBankAccount(db, admin, { bankName: "Test Bank", accountHolder: "Mezbaha Teknolojileri A.Ş.", iban: VALID_IBAN, active: true })).id;
  });
  afterAll(async () => {
    await db.paymentNotice.deleteMany({});
    await db.bankAccount.deleteMany({});
    await db.loginAttempt.deleteMany({ where: { OR: [{ key: { startsWith: "order" } }, { key: { startsWith: "notice" } }] } });
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  it("re-prices the cart on the server (KDV dahil: net + VAT = gross)", async () => {
    const r = await resolveCartLines(db, [{ productRef: verifiedRef, variantId: null, quantity: 3 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines[0]!.unitPriceMinor).toBe(120_000_00n);
    expect((await resolveCartLines(db, [{ productRef: unverifiedRef, variantId: null, quantity: 1 }])).ok).toBe(false);
  });

  it("places an order AWAITING_PAYMENT, idempotently; rejects closed gate, spam and unverified prices", async () => {
    const i = input();
    const a = await placeBankTransferOrder(db, gate, i, { ipHash: null, isTest: true });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.totalMinor).toBe(240_000_00n);
    expect(a.number).toMatch(/^TEST-KRN-\d{6}-[A-Z0-9]{5}$/);
    const again = await placeBankTransferOrder(db, gate, i, { ipHash: null, isTest: true });
    expect(again.ok && again.duplicate && again.number === a.number).toBe(true);
    const o = await db.order.findUniqueOrThrow({ where: { number: a.number } });
    expect([o.status, o.paymentStatus, o.paymentMethod, o.taxMinor]).toEqual(["AWAITING_PAYMENT", "UNPAID", "BANK_TRANSFER", 40_000_00n]);
    expect((await placeBankTransferOrder(db, commerceGate({}), input(), { ipHash: null })).ok).toBe(false);
    expect(await placeBankTransferOrder(db, gate, input({ website: "x" }), { ipHash: null, isTest: true })).toEqual({ ok: false, code: "spam" });
    expect(await placeBankTransferOrder(db, gate, input({ startedAt: Date.now() }), { ipHash: null, isTest: true })).toEqual({ ok: false, code: "spam" });
    expect(await placeBankTransferOrder(db, gate, input({ items: [{ productRef: unverifiedRef, variantId: null, quantity: 1 }] }), { ipHash: null, isTest: true })).toEqual({ ok: false, code: "not_purchasable" });
    const bad = await placeBankTransferOrder(db, gate, input({ taxNumber: "12", acceptTerms: false as never }), { ipHash: null, isTest: true });
    expect(bad.ok === false && bad.code === "validation" && bad.fields.taxNumber === "invalidTaxNumber" && bad.fields.acceptTerms === "acceptTerms").toBe(true);
  });

  it("lookup needs number + matching e-mail; notice → admin confirms → PAID", async () => {
    const placed = await placeBankTransferOrder(db, gate, input({ email: "lookup@kornne.test" }), { ipHash: null, isTest: true });
    if (!placed.ok) throw new Error("order not placed");
    expect((await lookupOrderStatus(db, { number: placed.number, email: "other@kornne.test" }, { ipHash: null })).ok).toBe(false);
    const found = await lookupOrderStatus(db, { number: placed.number.toLowerCase(), email: "LOOKUP@kornne.test" }, { ipHash: null });
    expect(found.ok && found.order.status).toBe("AWAITING_PAYMENT");

    const today = new Date().toISOString().slice(0, 10);
    expect((await submitPaymentNotice(db, { number: placed.number, email: "lookup@kornne.test", payerName: "Test Et", bankAccountId: bankId, amount: "240.000,00", paidAt: "2001-01-01" }, { ipHash: null })).ok).toBe(false);
    expect(await submitPaymentNotice(db, { number: placed.number, email: "lookup@kornne.test", payerName: "Test Et", bankAccountId: bankId, amount: "240.000,00", paidAt: today }, { ipHash: null })).toEqual({ ok: true });
    const notice = await db.paymentNotice.findFirstOrThrow({ where: { order: { number: placed.number } } });
    expect(notice.amountMinor).toBe(240_000_00n);

    const admin = await makeUser(db, "ADMIN");
    const id = (await db.order.findUniqueOrThrow({ where: { number: placed.number } })).id;
    await expect(confirmBankTransfer(db, admin, id, "")).rejects.toThrow(/Kontrol notu/);
    await confirmBankTransfer(db, admin, id, "Test hesap hareketi");
    const paid = await db.order.findUniqueOrThrow({ where: { id }, include: { paymentNotices: true } });
    expect([paid.status, paid.paymentStatus, paid.paymentNotices[0]!.status]).toEqual(["PAID", "PAID", "MATCHED"]);
    await expect(confirmBankTransfer(db, admin, id, "ikinci kez")).rejects.toThrow(/ödeme beklemiyor/);
    expect((await submitPaymentNotice(db, { number: placed.number, email: "lookup@kornne.test", payerName: "x y", bankAccountId: bankId, amount: "1", paidAt: today }, { ipHash: null })).ok).toBe(false);
  });

  it("bank accounts: invalid / placeholder IBAN rejected, inactive accounts never public", async () => {
    const admin = await makeUser(db, "ADMIN");
    await expect(saveBankAccount(db, admin, { bankName: "X Bank", accountHolder: "Test", iban: "TR00 0000 0000 0000 0000 0000 00", active: true })).rejects.toThrow(/IBAN/);
    await expect(saveBankAccount(db, admin, { bankName: "X Bank", accountHolder: "Test", iban: "", active: true })).rejects.toThrow(/IBAN/);
    await saveBankAccount(db, admin, { bankName: "Pasif Bank", accountHolder: "Test", iban: VALID_IBAN, active: false });
    const pub = await listPublicBankAccounts(db);
    expect(pub.map((b) => b.bankName)).toEqual(["Test Bank"]);
    expect(pub[0]!.ibanFormatted).toBe("TR33 0006 1005 1978 6457 8413 26");
  });
});
