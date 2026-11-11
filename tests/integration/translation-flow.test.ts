import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { approveMatch, publishProductTranslation, rejectMatch, rematch, reopenMatch, unpublishProductTranslation } from "@/lib/admin/translations";
import { cleanupTestSchema, hasTestDb, makeProduct, testDb } from "./test-schema";

/**
 * EN/FR match decisions and translation publishing in the isolated schema, with fixture legacy records + redirects
 * shaped like the real ones (e.g. EN #140 → /urun/circular-cutting-cell → /en/category/all-products).
 */
describe.skipIf(!hasTestDb)("translation approval workflow (isolated test schema)", () => {
  const db = testDb();
  let actor = { id: "" };
  let product: Awaited<ReturnType<typeof makeProduct>>;
  let other: Awaited<ReturnType<typeof makeProduct>>;

  async function fixtureMatch(p: { product: { id: string }; ref: string }, legacyId: string, opts: { confidence?: number; legacyTitle?: string; trTitle?: string } = {}) {
    const slug = `e2e-legacy-${legacyId}`;
    await db.legacySourceRecord.create({ data: { entityType: "product", legacyId, locale: "en", sourceUrl: `https://kornne.com/urun/${slug}`, capturedAt: new Date(), payload: { title: opts.legacyTitle ?? `Legacy EN ${legacyId}`, slug, description_html: "<p>Legacy <b>text</b><script>x()</script></p>", source_url: `https://kornne.com/urun/${slug}` }, migrationStatus: "match_suggested" } });
    await db.redirect.create({ data: { fromPath: `/urun/${slug}`, toPath: "/en/category/all-products", source: "LEGACY_AUDIT" } });
    return db.legacyMatchSuggestion.create({ data: { sourceLocale: "en", sourceLegacyId: legacyId, productId: p.product.id, confidence: opts.confidence ?? 90, method: "record-order+image-sha256+price", evidence: { legacyTitle: opts.legacyTitle ?? `Legacy EN ${legacyId}`, trTitle: opts.trTitle ?? "TEST", priceEqual: false } } });
  }

  async function wipe(d: PrismaClient) {
    await d.legacyMatchSuggestion.deleteMany({ where: { sourceLegacyId: { startsWith: "99" } } });
    await d.legacySourceRecord.deleteMany({ where: { legacyId: { startsWith: "99" } } });
    await d.redirect.deleteMany({ where: { fromPath: { startsWith: "/urun/e2e-legacy-" } } });
    await d.user.deleteMany({ where: { email: "translation-actor@kornne.test" } });
  }

  beforeAll(async () => {
    await cleanupTestSchema(db);
    await wipe(db);
    actor = await db.user.create({ data: { email: "translation-actor@kornne.test", name: "T", passwordHash: "!", role: "ADMIN" } });
    product = await makeProduct(db);
    other = await makeProduct(db);
  });
  afterAll(async () => {
    await wipe(db);
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  it("approve creates a NON-public draft from the legacy text (sanitized) and does not touch the legacy redirect", async () => {
    const m = await fixtureMatch(product, "9901");
    await approveMatch(db, actor, { id: m.id });
    const t = await db.productTranslation.findUniqueOrThrow({ where: { productId_locale: { productId: product.product.id, locale: "en" } } });
    expect(t.status).toBe("IN_REVIEW");
    expect(t.descriptionHtml).not.toContain("script");
    expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: "/urun/e2e-legacy-9901" } })).toPath).toBe("/en/category/all-products");
    expect((await db.legacyMatchSuggestion.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("APPROVED");
    // a decided suggestion cannot be decided again
    await expect(approveMatch(db, actor, { id: m.id })).rejects.toThrow(/karara bağlanmış/);
  });

  it("publish makes it public and points the legacy URL at it; unpublish restores the previous target", async () => {
    const path = await publishProductTranslation(db, actor, product.product.id, "en");
    expect(path).toBe("/product/e2e-legacy-9901");
    expect((await db.productTranslation.findUniqueOrThrow({ where: { productId_locale: { productId: product.product.id, locale: "en" } } })).status).toBe("APPROVED");
    expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: "/urun/e2e-legacy-9901" } })).toPath).toBe(path);
    await unpublishProductTranslation(db, actor, product.product.id, "en");
    expect((await db.productTranslation.findUniqueOrThrow({ where: { productId_locale: { productId: product.product.id, locale: "en" } } })).status).toBe("IN_REVIEW");
    expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: "/urun/e2e-legacy-9901" } })).toPath).toBe("/en/category/all-products");
    // publish again → again live (repeatable)
    await publishProductTranslation(db, actor, product.product.id, "en");
    expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: "/urun/e2e-legacy-9901" } })).toPath).toBe(path);
  });

  it("low confidence needs explicit confirmation + reason; 'Kurban Yatırma Kabini' needs a customer approval reference", async () => {
    const low = await fixtureMatch(other, "9902", { confidence: 30 });
    await expect(approveMatch(db, actor, { id: low.id })).rejects.toThrow(/Düşük güvenli/);
    await expect(approveMatch(db, actor, { id: low.id, confirmLowConfidence: "on", note: "kısa" })).rejects.toThrow(/Düşük güvenli/);
    const cabin = await fixtureMatch(other, "9903", { confidence: 95, legacyTitle: "Sacrifice Laying Cabin", trTitle: "Kurban Yatırma Kabini" });
    await expect(approveMatch(db, actor, { id: cabin.id })).rejects.toThrow(/müşteri kararı/);
    await rejectMatch(db, actor, { id: cabin.id, note: "müşteri onayı yok" });
    expect((await db.legacyMatchSuggestion.findUniqueOrThrow({ where: { id: cabin.id } })).status).toBe("REJECTED");
    await reopenMatch(db, actor, cabin.id);
    expect((await db.legacyMatchSuggestion.findUniqueOrThrow({ where: { id: cabin.id } })).status).toBe("SUGGESTED");
    await approveMatch(db, actor, { id: low.id, confirmLowConfidence: "on", note: "görseller ve metin karşılaştırıldı" });
    expect((await db.legacyMatchSuggestion.findUniqueOrThrow({ where: { id: low.id } })).status).toBe("APPROVED");
  });

  it("re-match points a suggestion at another product (never one that already has that language)", async () => {
    const third = await makeProduct(db);
    const m = await fixtureMatch(third, "9904");
    await expect(rematch(db, actor, { id: m.id, productId: product.product.id, note: "yanlış ürün, düzeltildi" })).rejects.toThrow(/zaten var/);
    const fourth = await makeProduct(db);
    await rematch(db, actor, { id: m.id, productId: fourth.product.id, note: "yanlış ürün, düzeltildi" });
    const after = await db.legacyMatchSuggestion.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.productId).toBe(fourth.product.id);
    expect(after.status).toBe("SUGGESTED");
    expect(after.method).toBe("manual_rematch");
  });
});

describe.skipIf(!hasTestDb)("translation workflow — concurrent duplicates", () => {
  const db = testDb();
  it("two simultaneous publishes: exactly one wins and the legacy target is preserved for unpublish", async () => {
    const actor = await db.user.create({ data: { email: "translation-race@kornne.test", name: "R", passwordHash: "!", role: "ADMIN" } });
    const p = await makeProduct(db);
    const slug = "e2e-legacy-9905";
    await db.legacySourceRecord.create({ data: { entityType: "product", legacyId: "9905", locale: "en", sourceUrl: `https://kornne.com/urun/${slug}`, capturedAt: new Date(), payload: { title: "Race", slug, source_url: `https://kornne.com/urun/${slug}` } } });
    await db.redirect.create({ data: { fromPath: `/urun/${slug}`, toPath: "/en/category/all-products", source: "LEGACY_AUDIT" } });
    const m = await db.legacyMatchSuggestion.create({ data: { sourceLocale: "en", sourceLegacyId: "9905", productId: p.product.id, confidence: 90, method: "x", evidence: {} } });
    try {
      const approvals = await Promise.allSettled([approveMatch(db, actor, { id: m.id }), approveMatch(db, actor, { id: m.id })]);
      expect(approvals.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const pubs = await Promise.allSettled([publishProductTranslation(db, actor, p.product.id, "en"), publishProductTranslation(db, actor, p.product.id, "en")]);
      expect(pubs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await db.legacyMatchSuggestion.findUniqueOrThrow({ where: { id: m.id } })).previousRedirectTo).toBe("/en/category/all-products");
      await unpublishProductTranslation(db, actor, p.product.id, "en");
      expect((await db.redirect.findUniqueOrThrow({ where: { fromPath: `/urun/${slug}` } })).toPath).toBe("/en/category/all-products");
    } finally {
      await db.legacyMatchSuggestion.deleteMany({ where: { id: m.id } });
      await db.legacySourceRecord.deleteMany({ where: { legacyId: "9905" } });
      await db.redirect.deleteMany({ where: { fromPath: `/urun/${slug}` } });
      await db.product.deleteMany({ where: { id: p.product.id } });
      await db.user.deleteMany({ where: { id: actor.id } });
      await db.$disconnect();
    }
  });
});
