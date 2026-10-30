import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQuoteRequest } from "@/lib/quote/service";
import { cleanupTestSchema, hasTestDb, makeProduct, testDb } from "./test-schema";

/** Quote service against the isolated "kornne_test" schema (no real catalog / customer data involved). */
describe.skipIf(!hasTestDb)("quote requests (isolated test schema)", () => {
  const db = testDb();
  let ref = "";
  let heldRef = "";
  let variantProduct: Awaited<ReturnType<typeof makeProduct>>;
  const input = (over: Record<string, unknown> = {}) => ({
    locale: "tr" as const,
    name: "Test Kişi",
    email: `qa-${randomUUID().slice(0, 8)}@kornne.test`,
    items: [{ productRef: ref, quantity: 3 }],
    idempotencyKey: randomUUID(),
    startedAt: Date.now() - 5_000,
    ...over,
  });

  beforeAll(async () => {
    await cleanupTestSchema(db);
    ref = (await makeProduct(db)).ref;
    heldRef = (await makeProduct(db, { needsReview: true })).ref;
    variantProduct = await makeProduct(db, { variants: ["6'lı", "8'li"] });
  });
  afterAll(async () => {
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  it("stores the request, items, NEW event and a PII-free audit row — and no price anywhere", async () => {
    const r = await createQuoteRequest(db, input({ email: "Upper.Case@KORNNE.test", message: "<b>merhaba</b>" }), { ipHash: "ip-a" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = await db.quoteRequest.findUniqueOrThrow({ where: { reference: r.reference }, include: { items: true, events: true } });
    expect(q.email).toBe("upper.case@kornne.test");
    expect(q.message).toBe("<b>merhaba</b>"); // stored as text, rendered escaped
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ quantity: 3, sourceKey: `kornne.com:${ref}`, titleSnapshot: `TEST ürün ${ref}` });
    expect(Object.keys(q.items[0]!).some((k) => /price|amount|total/i.test(k))).toBe(false);
    expect(q.events.map((e) => e.toStatus)).toEqual(["NEW"]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "quote.created", entityId: q.id } });
    expect(JSON.stringify(audit.after)).not.toMatch(/upper\.case|Test Kişi|merhaba/i);
  });

  it("is idempotent: the same submission twice (and concurrently) yields one request", async () => {
    const same = input();
    const [a, b] = await Promise.all([createQuoteRequest(db, same, { ipHash: "ip-b" }), createQuoteRequest(db, same, { ipHash: "ip-b" })]);
    const c = await createQuoteRequest(db, same, { ipHash: "ip-b" });
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(new Set([a.reference, b.reference, c.reference]).size).toBe(1);
    expect(await db.quoteRequest.count({ where: { idempotencyKey: same.idempotencyKey } })).toBe(1);
  });

  it("merges duplicate lines and caps the quantity", async () => {
    const r = await createQuoteRequest(db, input({ items: [{ productRef: ref, quantity: 600 }, { productRef: ref, quantity: 600 }] }), { ipHash: "ip-c" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const items = await db.quoteItem.findMany({ where: { quoteRequest: { reference: r.reference } } });
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(999);
  });

  it("refuses products that are not public (held for review) or unknown", async () => {
    expect(await createQuoteRequest(db, input({ items: [{ productRef: heldRef, quantity: 1 }] }), { ipHash: "ip-d" })).toEqual({ ok: false, code: "items" });
    expect(await createQuoteRequest(db, input({ items: [{ productRef: "9999999", quantity: 1 }] }), { ipHash: "ip-d" })).toEqual({ ok: false, code: "items" });
  });

  it("requires a real variant when the product has variants", async () => {
    const vref = variantProduct.ref;
    expect(await createQuoteRequest(db, input({ items: [{ productRef: vref, quantity: 1 }] }), { ipHash: "ip-e" })).toEqual({ ok: false, code: "items" });
    expect(await createQuoteRequest(db, input({ items: [{ productRef: vref, variantId: "cxxxxxxxxxxxxxxxxxxxxxxxx", quantity: 1 }] }), { ipHash: "ip-e" })).toEqual({ ok: false, code: "items" });
    const ok = await createQuoteRequest(db, input({ items: [{ productRef: vref, variantId: variantProduct.product.variants[1]!.id, quantity: 1 }] }), { ipHash: "ip-e" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((await db.quoteItem.findFirstOrThrow({ where: { quoteRequest: { reference: ok.reference } } })).variantLabel).toBe("8'li");
  });

  it("blocks bots (honeypot, too fast) without revealing why", async () => {
    expect(await createQuoteRequest(db, input({ website: "http://spam" }), { ipHash: "ip-f" })).toEqual({ ok: false, code: "spam" });
    expect(await createQuoteRequest(db, input({ startedAt: Date.now() }), { ipHash: "ip-f" })).toEqual({ ok: false, code: "spam" });
  });

  it("rate-limits per IP hash (5 / hour)", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await createQuoteRequest(db, input(), { ipHash: "ip-rate" }));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, code: "rate" });
  });

  it("returns field codes for invalid input, never echoing it", async () => {
    const r = await createQuoteRequest(db, input({ name: "", email: "x", items: [{ productRef: ref, quantity: 0 }] }), { ipHash: "ip-g" });
    expect(r.ok).toBe(false);
    if (r.ok || r.code !== "validation") return;
    expect(r.fields).toMatchObject({ name: "required", email: "invalidEmail", items: "items" });
  });

  it("load (Sprint 11): 25 concurrent submissions with one key → 1 request; 25 distinct keys from distinct IPs → 25, one outbox row each", async () => {
    const same = input();
    const t0 = Date.now();
    const dup = await Promise.all(Array.from({ length: 25 }, () => createQuoteRequest(db, same, { ipHash: "ip-load-same" })));
    const refs = new Set(dup.map((r) => (r.ok ? r.reference : "x")));
    expect(refs.size).toBe(1);
    expect(dup.every((r) => r.ok)).toBe(true);
    expect(await db.quoteRequest.count({ where: { idempotencyKey: same.idempotencyKey } })).toBe(1);
    const many = await Promise.all(Array.from({ length: 25 }, (_, i) => createQuoteRequest(db, input(), { ipHash: `ip-load-${i}` })));
    expect(many.filter((r) => r.ok).length).toBe(25);
    const ids = (await db.quoteRequest.findMany({ where: { reference: { in: many.map((r) => (r.ok ? r.reference : "")) } }, select: { id: true } })).map((q) => q.id);
    expect(ids).toHaveLength(25);
    expect(await db.notificationOutbox.count({ where: { entityId: { in: ids } } })).toBe(25);
    console.log(`[load] 50 concurrent quote submissions in ${Date.now() - t0} ms (local PG, Prisma pool)`);
  }, 60_000);
});
