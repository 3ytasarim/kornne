import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminError } from "@/lib/admin/action-state";
import { allowed } from "@/lib/auth/rbac";
import { loadFeedSources } from "@/lib/merchant/facts";
import { applyMerchantReview, type ReviewInput } from "@/lib/merchant/review";
import { cleanupTestSchema, hasTestDb, makeProduct, makeUser, testDb } from "./test-schema";

/**
 * Admin › Merchant › Toplu onay: real stock / lead time / brand / MPN recorded in bulk by an authorised person with a
 * source note. Nothing is guessed: made to order needs a lead time, GTINs are never generated, every change is audited.
 */
describe.skipIf(!hasTestDb)("Merchant bulk review (isolated test DB)", () => {
  const db = testDb();
  let actor = { id: "" };
  let a = "";
  let b = "";
  const base = (o: Partial<ReviewInput> = {}): ReviewInput => ({ productIds: [a, b], confirm: true, note: "TEST üretim teyidi 13.11.2026", ...o });

  beforeAll(async () => {
    await cleanupTestSchema(db);
    actor = await makeUser(db, "ADMIN");
    a = (await makeProduct(db, { priceStatus: "VERIFIED" })).product.id;
    b = (await makeProduct(db, { priceStatus: "VERIFIED" })).product.id;
  });
  afterAll(async () => {
    await cleanupTestSchema(db);
  });

  it("only SUPER_ADMIN / ADMIN may approve", () => {
    expect(allowed("ADMIN", "merchant.approve")).toBe(true);
    expect(allowed("SUPER_ADMIN", "merchant.approve")).toBe(true);
    expect(allowed("PRODUCT_EDITOR", "merchant.approve")).toBe(false);
    expect(allowed("SEO_EDITOR", "merchant.approve")).toBe(false);
  });

  it("refuses without the confirmation or a source note, and writes nothing", async () => {
    await expect(applyMerchantReview(db, actor, base({ confirm: undefined as unknown as true, availability: "IN_STOCK" }))).rejects.toBeInstanceOf(AdminError);
    await expect(applyMerchantReview(db, actor, base({ note: "", availability: "IN_STOCK" }))).rejects.toBeInstanceOf(AdminError);
    expect(await db.inventory.count({ where: { productId: { in: [a, b] } } })).toBe(0);
  });

  it("made to order without a lead time is refused up front — no partial write", async () => {
    await expect(applyMerchantReview(db, actor, base({ availability: "MADE_TO_ORDER" }))).rejects.toThrow(/temin süresi/);
    expect(await db.inventory.count({ where: { productId: { in: [a, b] } } })).toBe(0);
  });

  it("records stock + lead time + verified brand + MPN / identifier_exists=no with an audit row per product", async () => {
    const r = await applyMerchantReview(db, actor, base({ availability: "MADE_TO_ORDER", leadTimeDays: "21" as unknown as number, brand: "TEST Marka", identifierNone: true, mpn: { [a]: "KRN-TEST-01" } }));
    expect(r).toMatchObject({ selected: 2, changed: 2, brandVerified: true, mpnSet: 1 });
    const inv = await db.inventory.findMany({ where: { productId: { in: [a, b] } } });
    expect(inv.every((i) => i.availability === "MADE_TO_ORDER" && i.leadTimeDays === 21)).toBe(true);
    const pa = await db.product.findUniqueOrThrow({ where: { id: a }, include: { brand: true } });
    const pb = await db.product.findUniqueOrThrow({ where: { id: b }, include: { brand: true } });
    expect(pa.mpn).toBe("KRN-TEST-01");
    expect(pa.identifierExists).toBeNull(); // has an MPN → identifier_exists=no is NOT applied
    expect(pb.mpn).toBeNull();
    expect(pb.identifierExists).toBe(false);
    expect(pa.gtin).toBeNull(); // never generated
    expect(pa.brand?.status).toBe("VERIFIED");
    expect(await db.auditLog.count({ where: { action: "merchant.data_reviewed", entityId: { in: [a, b] } } })).toBe(2);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "merchant.data_reviewed", entityId: a } });
    expect(JSON.stringify(log.after)).toContain("TEST üretim teyidi");

    // the feed facts now carry the real values
    const src = await loadFeedSources(db, { contentLanguage: "tr", feedLabel: "TR" });
    const fa = src.find((s) => s.id === a)!;
    expect(fa).toMatchObject({ availability: "MADE_TO_ORDER", leadTimeDays: 21, brandVerified: true, mpn: "KRN-TEST-01" });
  });

  it("empty fields leave values unchanged; an invalid MPN is refused", async () => {
    await expect(applyMerchantReview(db, actor, base())).rejects.toThrow(/Değiştirilecek/);
    await expect(applyMerchantReview(db, actor, base({ mpn: { [a]: "<script>" } }))).rejects.toThrow(/Geçersiz MPN/);
    const r = await applyMerchantReview(db, actor, base({ productIds: [b], availability: "IN_STOCK" }));
    expect(r.changed).toBe(1);
    const inv = await db.inventory.findFirstOrThrow({ where: { productId: b } });
    expect(inv).toMatchObject({ availability: "IN_STOCK", leadTimeDays: 21 });
    expect((await db.product.findUniqueOrThrow({ where: { id: a } })).mpn).toBe("KRN-TEST-01");
  });
});
