import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commerceGate, TEST_COMMERCE_ENV } from "@/lib/commerce/gate";
import { MockProvider } from "@/lib/commerce/payments/provider";
import { addToCart, CommerceError, createDraftOrder, getOrderForViewer, processWebhook, startPayment } from "@/lib/commerce/service";
import { computeTotals } from "@/lib/commerce/totals";
import { cleanupTestSchema, hasTestDb, makeProduct, testDb } from "./test-schema";

/**
 * Priced checkout simulated end-to-end in the ISOLATED "kornne_test" schema with a mock provider:
 * verified product → cart → totals → draft order → payment → signed "paid" webhook → state change;
 * plus replay, forged signature, amount mismatch, concurrency, IDOR and a closed gate.
 */
describe.skipIf(!hasTestDb)("paid checkout (isolated test schema, mock provider)", () => {
  const db = testDb();
  const gate = commerceGate(TEST_COMMERCE_ENV);
  const closed = commerceGate({});
  const provider = new MockProvider(randomBytes(32).toString("hex"));
  let verifiedId = "";
  let unverifiedId = "";
  const body = (o: { id: string; ref: string; status?: "succeeded" | "failed"; amount: bigint; currency?: string }) => JSON.stringify({ id: o.id, ref: o.ref, status: o.status ?? "succeeded", amount: o.amount.toString(), currency: o.currency ?? "TRY" });
  const signed = (raw: string) => new Headers({ "x-mock-signature": provider.sign(raw) });

  async function paidReadyOrder(qty = 2) {
    const token = randomBytes(16).toString("hex");
    await addToCart(db, gate, token, verifiedId, null, qty, { isTest: true });
    const { order, accessToken, totals } = await createDraftOrder(db, gate, token, { contact: { name: "Test", email: "buyer@kornne.test" }, shippingAddress: { city: "Test" } }, { isTest: true, shippingMinor: 50000n });
    const attempt = await startPayment(db, gate, provider, order.id, randomUUID());
    return { order, accessToken, totals, attempt };
  }

  beforeAll(async () => {
    expect(gate.enabled).toBe(true);
    await cleanupTestSchema(db);
    verifiedId = (await makeProduct(db, { priceStatus: "VERIFIED", amountMinor: 1_807_479_94n, vatIncluded: true, vatRateBp: 2000 })).product.id;
    unverifiedId = (await makeProduct(db, { priceStatus: "UNVERIFIED" })).product.id;
  });
  afterAll(async () => {
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  it("closed gate: nothing can be added or ordered", async () => {
    await expect(addToCart(db, closed, "t", verifiedId, null, 1)).rejects.toMatchObject({ code: "checkout_disabled" });
  });

  it("an UNVERIFIED price can never enter a cart, even with the gate open", async () => {
    await expect(addToCart(db, gate, randomUUID(), unverifiedId, null, 1, { isTest: true })).rejects.toBeInstanceOf(CommerceError);
  });

  it("rejects invalid quantities server-side", async () => {
    for (const q of [0, -1, 1000, 1.5]) await expect(addToCart(db, gate, randomUUID(), verifiedId, null, q, { isTest: true })).rejects.toMatchObject({ code: "invalid_quantity" });
  });

  it("happy path: totals from DB prices → AWAITING_PAYMENT → signed webhook → PAID", async () => {
    const { order, totals, attempt } = await paidReadyOrder(2);
    expect(totals).toEqual(computeTotals([{ unitPriceMinor: 1_807_479_94n, quantity: 2, vatRateBp: 2000, vatIncluded: true }], 50000n));
    expect(order.totalMinor).toBe(totals.totalMinor);
    expect(attempt.amountMinor).toBe(totals.totalMinor);
    const raw = body({ id: `evt_${randomUUID()}`, ref: attempt.providerRef, amount: attempt.amountMinor });
    expect(await processWebhook(db, gate, provider, raw, signed(raw))).toEqual({ httpStatus: 200, outcome: "paid" });
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { statusEvents: true } });
    expect(after.status).toBe("PAID");
    expect(after.statusEvents.map((e) => e.toStatus)).toEqual(["DRAFT", "AWAITING_PAYMENT", "PAID"]);
    // replay of the same event → no second transition
    expect(await processWebhook(db, gate, provider, raw, signed(raw))).toEqual({ httpStatus: 200, outcome: "duplicate" });
    expect(await db.orderStatusEvent.count({ where: { orderId: order.id, toStatus: "PAID" } })).toBe(1);
  });

  it("startPayment is idempotent per key and refuses paid orders", async () => {
    const { order, attempt } = await paidReadyOrder(1);
    const key = (await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).idempotencyKey;
    expect((await startPayment(db, gate, provider, order.id, key)).id).toBe(attempt.id);
    const raw = body({ id: `evt_${randomUUID()}`, ref: attempt.providerRef, amount: attempt.amountMinor });
    await processWebhook(db, gate, provider, raw, signed(raw));
    await expect(startPayment(db, gate, provider, order.id, randomUUID())).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("forged / tampered signatures are rejected and change nothing", async () => {
    const { order, attempt } = await paidReadyOrder(1);
    const raw = body({ id: `evt_${randomUUID()}`, ref: attempt.providerRef, amount: attempt.amountMinor });
    const forged = new Headers({ "x-mock-signature": new MockProvider(randomBytes(32).toString("hex")).sign(raw) });
    expect(await processWebhook(db, gate, provider, raw, forged)).toEqual({ httpStatus: 401, outcome: "rejected_signature" });
    expect(await processWebhook(db, gate, provider, raw.replace('"succeeded"', '"failed"'), signed(raw))).toMatchObject({ httpStatus: 401 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("AWAITING_PAYMENT");
  });

  it("amount or currency mismatch never marks an order paid", async () => {
    const { order, attempt } = await paidReadyOrder(1);
    const raw = body({ id: `evt_${randomUUID()}`, ref: attempt.providerRef, amount: attempt.amountMinor - 1n });
    expect(await processWebhook(db, gate, provider, raw, signed(raw))).toEqual({ httpStatus: 400, outcome: "amount_mismatch" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("FAILED");
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).failureReason).toBe("amount_or_currency_mismatch");
  });

  it("concurrent distinct 'paid' callbacks transition the order exactly once", async () => {
    const { order, attempt } = await paidReadyOrder(1);
    const raws = Array.from({ length: 4 }, () => body({ id: `evt_${randomUUID()}`, ref: attempt.providerRef, amount: attempt.amountMinor }));
    const res = await Promise.all(raws.map((r) => processWebhook(db, gate, provider, r, signed(r))));
    expect(res.filter((r) => r.outcome === "paid")).toHaveLength(1);
    expect(res.filter((r) => r.outcome === "ignored_state")).toHaveLength(3);
    expect(await db.orderStatusEvent.count({ where: { orderId: order.id, toStatus: "PAID" } })).toBe(1);
  });

  it("unknown payment references are refused", async () => {
    const raw = body({ id: `evt_${randomUUID()}`, ref: "mock_does_not_exist", amount: 1n });
    expect(await processWebhook(db, gate, provider, raw, signed(raw))).toEqual({ httpStatus: 404, outcome: "unknown_payment" });
  });

  it("IDOR: only the access-token holder (or owner) can read an order", async () => {
    const { order, accessToken } = await paidReadyOrder(1);
    expect(await getOrderForViewer(db, order.id, {})).toBeNull();
    expect(await getOrderForViewer(db, order.id, { accessToken: "wrong-token" })).toBeNull();
    expect(await getOrderForViewer(db, order.id, { customerId: "someone-else" })).toBeNull();
    expect((await getOrderForViewer(db, order.id, { accessToken }))?.id).toBe(order.id);
  });

  it("closed gate also blocks webhooks", async () => {
    await expect(processWebhook(db, closed, provider, "{}", new Headers())).rejects.toMatchObject({ code: "checkout_disabled" });
  });
});
