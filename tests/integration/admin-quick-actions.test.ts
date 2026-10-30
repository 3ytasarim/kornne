import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setPriceDirect, livePrice } from "@/lib/admin/prices";
import { fillEmptyProductSeo } from "@/lib/admin/seo-fill";
import { deleteProduct, setProductActive } from "@/lib/admin/row-actions";
import { cleanupTestSchema, hasTestDb, makeProduct, makeUser, testDb } from "./test-schema";

/** Product-page price update, bulk SEO fill and list row actions (isolated local test DB). */
describe.skipIf(!hasTestDb)("admin quick actions", () => {
  const db = testDb();
  beforeAll(async () => cleanupTestSchema(db));
  afterAll(async () => {
    await cleanupTestSchema(db);
    await db.$disconnect();
  });

  it("direct price update goes live at once and ends the previous price (history kept)", async () => {
    const admin = await makeUser(db, "ADMIN");
    const { product } = await makeProduct(db, { priceStatus: "VERIFIED", amountMinor: 100_00n });
    await setPriceDirect(db, admin, { productId: product.id, amount: "1.250,50", vatMode: "included", vatRate: "20" });
    const rows = await db.price.findMany({ where: { productId: product.id } });
    const live = livePrice(rows);
    expect(live?.amountMinor).toBe(1_250_50n);
    expect(live?.vatIncluded).toBe(true);
    expect(rows.filter((r) => r.status === "VERIFIED").length).toBe(2); // old one kept, ended
    expect(await db.auditLog.count({ where: { action: "price.set_direct" } })).toBe(1);
    await expect(setPriceDirect(db, admin, { productId: product.id, amount: "0", vatMode: "included", vatRate: "20" })).rejects.toThrow();
  });

  it("bulk SEO fill writes only empty fields", async () => {
    const admin = await makeUser(db, "ADMIN");
    const a = await makeProduct(db);
    const b = await makeProduct(db);
    await db.productTranslation.updateMany({ where: { productId: a.product.id }, data: { seoTitle: "Elle yazılmış başlık", descriptionHtml: "<p>Paslanmaz gövde, pnömatik silindirli kesim makinesi. Büyükbaş hayvanlar için uygundur.</p>" } });
    const r = await fillEmptyProductSeo(db, admin);
    expect(r.titles).toBeGreaterThanOrEqual(1);
    const ta = await db.productTranslation.findFirstOrThrow({ where: { productId: a.product.id } });
    const tb = await db.productTranslation.findFirstOrThrow({ where: { productId: b.product.id } });
    expect(ta.seoTitle).toBe("Elle yazılmış başlık");
    expect(ta.seoDescription).toMatch(/Paslanmaz gövde/);
    expect(tb.seoTitle).toBe(tb.title);
    expect(tb.seoDescription!.length).toBeLessThanOrEqual(155);
  });

  it("row actions: deactivate / reactivate; legacy products are archived, new ones deleted", async () => {
    const admin = await makeUser(db, "ADMIN");
    const legacy = await makeProduct(db);
    await setProductActive(db, admin, legacy.product.id, false);
    expect((await db.product.findUniqueOrThrow({ where: { id: legacy.product.id } })).status).toBe("DRAFT");
    await setProductActive(db, admin, legacy.product.id, true);
    expect((await db.product.findUniqueOrThrow({ where: { id: legacy.product.id } })).status).toBe("PUBLISHED");
    expect(await deleteProduct(db, admin, legacy.product.id)).toBe("archived"); // has a legacy sourceKey
    const fresh = await db.product.create({ data: { status: "DRAFT", translations: { create: { locale: "tr", title: "Yeni test ürünü", slug: `yeni-test-${Date.now()}`, status: "APPROVED" } } } });
    expect(await deleteProduct(db, admin, fresh.id)).toBe("deleted");
    expect(await db.product.findUnique({ where: { id: fresh.id } })).toBeNull();
  });
});
