import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAndStoreSeoAudit } from "@/lib/admin/seo-audit";
import { TEST_COMMERCE_ENV } from "@/lib/commerce/gate";
import { MockMerchantClient } from "@/lib/merchant/api/mock";
import { MerchantDisabledError } from "@/lib/merchant/api/types";
import { evaluateCatalog, RETURNS_PAGE_KEY } from "@/lib/merchant/facts";
import { buildFeed } from "@/lib/merchant/feed";
import { previewMapping } from "@/lib/merchant/mapping";
import { runMerchantSync } from "@/lib/merchant/sync";
import { analyzeImages, loadImageRows } from "@/lib/seo/image-audit";
import { buildInventory } from "@/lib/seo/inventory";
import { cleanupTestSchema, hasTestDb, makeProduct, makeUser, testDb } from "./test-schema";

/**
 * Sprint 8+9 on the ISOLATED local database (kornne_it) — never Neon. Shows that readiness changes only through
 * real, verified data (price + VAT, stock, identifiers, brand, image, target settings) and that the adapter path is
 * idempotent, retries, rolls back stale items and records every run. All values below are TEST FIXTURES.
 */
const ENV = { ...TEST_COMMERCE_ENV, SITE_INDEXABLE: "true", CATALOG_DATA_VERIFIED: "true", SEO_LOCALES: "tr" };
const TARGET = { accountId: "MOCK-ACCOUNT", dataSourceId: "MOCK-1" };

describe.skipIf(!hasTestDb)("Merchant readiness + sync (isolated DB)", () => {
  let db: PrismaClient;
  let actor: { id: string };
  beforeAll(async () => {
    db = testDb();
    expect((await db.$queryRawUnsafe<{ db: string }[]>("select current_database() db"))[0]!.db).toBe("kornne_it");
    await cleanupTestSchema(db);
  });
  afterAll(async () => {
    await cleanupTestSchema(db);
    await db.$disconnect();
  });
  beforeEach(async () => {
    await cleanupTestSchema(db);
    actor = await makeUser(db, "ADMIN");
  });

  async function verifiedEnvironment() {
    const rows: [string, string][] = [["merchant.targetCountry", "TR"], ["merchant.contentLanguage", "tr"], ["merchant.feedLabel", "TR"], ["commerce.shippingPolicy", "TEST kargo kuralı"], ["company.legalName", "TEST A.Ş."]];
    for (const [key, value] of rows) await db.siteSetting.create({ data: { key, value, status: "VERIFIED", source: "integration fixture" } });
    await db.page.create({ data: { key: RETURNS_PAGE_KEY, kind: "LEGAL", status: "PUBLISHED", legalApprovedAt: new Date() } });
  }

  async function readyProduct() {
    const { product, ref } = await makeProduct(db, { priceStatus: "VERIFIED", amountMinor: 150000n, vatIncluded: true });
    const brand = await db.brand.create({ data: { name: `TESTBRAND ${ref}`, slug: `test-${ref}`, status: "VERIFIED" } });
    const media = await db.mediaAsset.create({ data: { storageKey: `test/${ref}.jpg`, publicPath: `/upload/test-${ref}.jpg`, sha256: "0".repeat(64), mime: "image/jpeg", bytes: 1000, width: 1600, height: 1600, origin: "admin_upload" } });
    await db.productMedia.create({ data: { productId: product.id, mediaId: media.id, isPrimary: true } });
    await db.inventory.create({ data: { productId: product.id, availability: "IN_STOCK" } });
    await db.product.update({ where: { id: product.id }, data: { brandId: brand.id, gtin: "4006381333931", googleProductCategory: "5" } });
    await db.productTranslation.update({ where: { productId_locale: { productId: product.id, locale: "tr" } }, data: { descriptionHtml: `<p>${"TEST açıklama metni. ".repeat(12)}</p>` } });
    return { product, ref };
  }
  const mine = async (ids: string[]) => (await evaluateCatalog(db, ENV)).candidates.filter((c) => ids.includes(c.id));

  it("unverified price / unknown stock stay BLOCKED; READY only after every real fact is verified", async () => {
    const raw = await makeProduct(db, { priceStatus: "UNVERIFIED" });
    let [e] = await mine([raw.product.id]);
    expect(e!.status).toBe("BLOCKED");
    expect(e!.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["TARGET_UNSET", "PRICE_UNVERIFIED", "AVAILABILITY_UNKNOWN", "IDENTIFIER_MISSING", "BRAND_UNVERIFIED", "IMAGE_MISSING", "RETURNS_UNVERIFIED"]));
    await verifiedEnvironment();
    const ok = await readyProduct();
    [e] = await mine([ok.product.id]);
    expect(e!.reasons.filter((r) => r.severity === "blocking")).toEqual([]);
    expect(e!.status).toBe("READY");
    // the environment gates are real: closed checkout or a noindex landing page blocks again
    const closed = (await evaluateCatalog(db, { ...ENV, ENABLE_PAID_CHECKOUT: "false" })).candidates.find((c) => c.id === ok.product.id)!;
    expect(closed.reasons.map((r) => r.code)).toContain("CHECKOUT_CLOSED");
    // the feed carries exactly the verified values — and never the blocked fixture
    const { ctx, candidates } = await evaluateCatalog(db, ENV);
    const feed = buildFeed(candidates.filter((c) => [raw.product.id, ok.product.id].includes(c.id)), ctx);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ id: `kornne-${ok.ref}`, price: "1500.00 TRY", availability: "in_stock", gtin: "4006381333931", content_language: "tr", feed_label: "TR" });
    expect(feed.excluded.map((x) => x.offerId)).toEqual([`kornne-${raw.ref}`]);
  });

  it("MOCK sync: sends READY items, is idempotent, re-sends on a price change, deletes when data is no longer verified", async () => {
    await verifiedEnvironment();
    const a = await readyProduct();
    const client = new MockMerchantClient();
    const r1 = await runMerchantSync(db, actor, { mode: "MOCK", client, target: TARGET, env: ENV });
    expect(r1.status).toBe("MOCK_OK");
    expect(r1.summary.sent).toContain(`kornne-${a.ref}`);
    const r2 = await runMerchantSync(db, actor, { mode: "MOCK", client, target: TARGET, env: ENV });
    expect(r2.summary.sent).toEqual([]);
    expect(r2.summary.skippedUnchanged).toContain(`kornne-${a.ref}`);
    // new verified price → payload hash changes → sent again
    await db.price.create({ data: { productId: a.product.id, amountMinor: 160000n, status: "VERIFIED", vatIncluded: true, vatRateBp: 2000, source: "ADMIN", validFrom: new Date() } });
    const r3 = await runMerchantSync(db, actor, { mode: "MOCK", client, target: TARGET, env: ENV });
    expect(r3.summary.sent).toEqual([`kornne-${a.ref}`]);
    expect([...client.store.values()][0]!.productAttributes.price).toEqual({ amountMicros: "1600000000", currencyCode: "TRY" });
    // stock becomes unknown → item drops out of READY → deleted from Merchant (rollback of stale data)
    await db.inventory.updateMany({ where: { productId: a.product.id }, data: { availability: "UNKNOWN" } });
    const r4 = await runMerchantSync(db, actor, { mode: "MOCK", client, target: TARGET, env: ENV });
    expect(r4.summary.deleted).toEqual([`kornne-${a.ref}`]);
    expect(client.store.size).toBe(0);
    const runs = await db.merchantSyncRun.findMany({ where: { mode: "MOCK" }, orderBy: { startedAt: "asc" } });
    expect(runs.map((r) => r.status)).toEqual(["MOCK_OK", "MOCK_OK", "MOCK_OK", "MOCK_OK"]);
    expect(await db.auditLog.count({ where: { action: "merchant.sync_mock" } })).toBe(4);
    // a MOCK run never marks the real mapping table as synced
    expect(await db.merchantItemMapping.count({ where: { lastSyncedAt: { not: null } } })).toBe(0);
  });

  it("MOCK sync: auth failure is recorded per item and retried next run; SIMULATED sends nothing; LIVE is refused", async () => {
    await verifiedEnvironment();
    const a = await readyProduct();
    const client = new MockMerchantClient();
    client.authOk = false;
    const r1 = await runMerchantSync(db, actor, { mode: "MOCK", client, target: TARGET, env: ENV });
    expect(r1.status).toBe("MOCK_FAILED");
    expect(r1.summary.errors[0]).toMatchObject({ offerId: `kornne-${a.ref}`, status: 401, code: "UNAUTHENTICATED" });
    client.authOk = true;
    const r2 = await runMerchantSync(db, actor, { mode: "MOCK", client, target: TARGET, env: ENV });
    expect(r2.summary.sent).toContain(`kornne-${a.ref}`);
    const sim = await runMerchantSync(db, actor, { mode: "SIMULATED", env: ENV });
    expect(sim.status).toBe("NOT_SENT");
    await expect(runMerchantSync(db, actor, { mode: "LIVE", target: TARGET, env: ENV })).rejects.toBeInstanceOf(MerchantDisabledError);
    await expect(runMerchantSync(db, actor, { mode: "MOCK", env: ENV })).rejects.toThrow(/mock client/);
  });

  it("item_id mapping preview: link/redirect and id-number matching, duplicates and conflicts — nothing written", async () => {
    const a = await makeProduct(db);
    const b = await makeProduct(db);
    await db.redirect.create({ data: { fromPath: `/urun/test-urun-${a.ref}-eski`, toPath: `/urun/test-urun-${a.ref}`, statusCode: 301, source: "SLUG_CHANGE" } });
    const csv = [
      "id,title,link,language,feed label",
      `x1,A,https://kornne.com/urun/test-urun-${a.ref}-eski,tr,TR`,
      `urun-${b.ref},B,,tr,TR`,
      `urun-${b.ref},B again,,tr,TR`,
      `x9,C,https://kornne.com/urun/test-urun-${a.ref},tr,TR`,
      "zz,Unknown,https://kornne.com/urun/yok,tr,TR",
    ].join("\n");
    const before = await db.merchantItemMapping.count();
    const r = await previewMapping(db, csv);
    expect(r.rows).toBe(5);
    expect(r.matched.map((m) => [m.offerId, m.ref, m.by])).toEqual(expect.arrayContaining([["x1", a.ref, "link"], [`urun-${b.ref}`, b.ref, "id-number"]]));
    expect(r.duplicates).toEqual([{ offerId: `urun-${b.ref}`, lines: [3, 4] }]);
    expect(r.conflicts.some((c) => c.kind === "many-ids-one-product")).toBe(true);
    expect(r.unmatched.map((u) => u.offerId)).toEqual(["zz"]);
    expect(await db.merchantItemMapping.count()).toBe(before);
  });

  it("SEO audit run is stored with findings (no PII) and audited; image rows load from the DB", async () => {
    const p = await makeProduct(db);
    const inv = await buildInventory(db, { seoLocales: ["tr"], verified: true });
    expect(inv.find((e) => e.path === `/urun/test-urun-${p.ref}`)).toMatchObject({ kind: "product", status: 200, indexable: true });
    expect(inv.filter((e) => e.kind === "product-missing-locale").every((e) => e.status === 404)).toBe(true);
    const fetchImpl = (async (url: string) => {
      const path = new URL(url).pathname;
      if (path === "/robots.txt") return new Response("User-Agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
      if (path === "/sitemap.xml") return new Response("<urlset></urlset>", { headers: { "content-type": "application/xml" } });
      return new Response(`<html lang="tr" dir="ltr"><head><title>Sayfa başlığı | KORNNE</title><meta name="robots" content="noindex, nofollow"/><link rel="canonical" href="http://127.0.0.1:1${path}"/></head><body><h1>x</h1></body></html>`, { status: inv.find((e) => e.path.split("?")[0] === path)?.status === 404 ? 404 : 200, headers: { "content-type": "text/html", "x-robots-tag": "noindex" } });
    }) as unknown as typeof fetch;
    const r = await runAndStoreSeoAudit(db, actor, { base: "http://127.0.0.1:1", fetchImpl });
    const run = await db.seoAuditRun.findUniqueOrThrow({ where: { id: r.id } });
    expect(run.urlCount).toBe(r.urls);
    expect(run.finishedAt).not.toBeNull();
    expect(JSON.stringify(run.results)).not.toMatch(/@kornne\.test|passwordHash/);
    expect(await db.auditLog.count({ where: { action: "seo.audit_run", entityId: r.id } })).toBe(1);
    const media = await db.mediaAsset.create({ data: { storageKey: "test/x.jpg", publicPath: "/upload/test-x.jpg", sha256: "1".repeat(64), mime: "image/jpeg", bytes: 10, width: 225, height: 225, origin: "admin_upload" } });
    await db.productMedia.create({ data: { productId: p.product.id, mediaId: media.id, isPrimary: true } });
    const { items } = analyzeImages(await loadImageRows(db));
    expect(items.find((i) => i.id === media.id)).toMatchObject({ isMainOfPublic: true, merchant: "BELOW_2027" });
  });
});
