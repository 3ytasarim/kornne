import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";
import { buildPlan } from "../../scripts/import/lib/plan";
import { loadSources } from "../../scripts/import/lib/sources";

/**
 * Read-only integration checks against the KORNNE Neon database (skipped without DIRECT_URL/DATABASE_URL).
 * Verifies that the applied import matches the plan exactly — counts, keys, hashes, visibility, price status.
 */
const base = process.env.DIRECT_URL || process.env.DATABASE_URL;
// the ONLY test touching Neon: every statement runs in a read-only session (the server refuses writes)
const url = base ? `${base}${base.includes("?") ? "&" : "?"}options=${encodeURIComponent("-c default_transaction_read_only=on")}` : null;
const db = url ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) : null;
afterAll(() => db?.$disconnect());

describe.skipIf(!db)("catalog in Neon matches the import plan", () => {
  const plan = buildPlan(loadSources());

  it("row counts equal the plan (no duplicates after repeated runs)", async () => {
    expect(await db!.product.count()).toBe(41);
    expect(await db!.productTranslation.count({ where: { locale: "tr" } })).toBe(41);
    expect(await db!.category.count()).toBe(4);
    expect(await db!.mediaAsset.count()).toBe(445);
    expect(await db!.productMedia.count()).toBe(plan.products.reduce((a, p) => a + p.images.length, 0));
    expect(await db!.productCategory.count()).toBe(plan.products.reduce((a, p) => a + p.categories.length, 0));
    expect(await db!.legacySourceRecord.count()).toBe(plan.legacyRecords.length);
    expect(await db!.legacyMatchSuggestion.count()).toBe(74);
    expect(await db!.redirect.count({ where: { source: "LEGACY_AUDIT" } })).toBe(125);
  });

  it("every product key is unique and maps to its legacy source id", async () => {
    const keys = (await db!.product.findMany({ select: { sourceKey: true } })).map((p) => p.sourceKey);
    expect(new Set(keys).size).toBe(41);
    expect(keys.sort()).toEqual(plan.products.map((p) => p.sourceKey).sort());
  });

  it("no price is verified and raw legacy strings are stored", async () => {
    expect(await db!.price.count({ where: { status: { not: "UNVERIFIED" } } })).toBe(0);
    expect(await db!.price.count({ where: { rawAmount: null } })).toBe(0);
  });

  it("#208 stays held for review; 40 products are public", async () => {
    expect(await db!.product.count({ where: { status: "PUBLISHED", needsReview: false } })).toBe(40);
    const held = await db!.product.findUnique({ where: { sourceKey: "kornne.com:208" } });
    expect(held?.needsReview).toBe(true);
    expect(held?.status).toBe("DRAFT");
  });

  it("media rows carry the original file hashes", async () => {
    const sample = await db!.mediaAsset.findMany({ take: 25, orderBy: { storageKey: "asc" } });
    for (const m of sample) expect(createHash("sha256").update(readFileSync(`data/source-media/${m.storageKey}`)).digest("hex")).toBe(m.sha256);
  });

  it("raw provenance keeps the original Turkish characters", async () => {
    const rec = await db!.legacySourceRecord.findUnique({ where: { entityType_legacyId_locale: { entityType: "product", legacyId: "127", locale: "tr" } } });
    expect((rec?.payload as { title: string }).title).toBe("Kasap Deri Yüzme Bıçak");
  });
});

describe.skipIf(!db)("Sprint 8+9 on the REAL data (read-only session)", () => {
  it("Merchant readiness: 0 of 40 storefront products READY, #208 held, every product with its reasons", async () => {
    const { evaluateCatalog } = await import("@/lib/merchant/facts");
    const { candidates, ready, held, byReason } = await evaluateCatalog(db!, {});
    expect(candidates).toHaveLength(40);
    expect(ready).toHaveLength(0);
    expect(held.map((h) => h.ref)).toEqual(["208"]);
    expect(byReason.PRICE_UNVERIFIED).toBe(40);
    expect(byReason.AVAILABILITY_UNKNOWN).toBe(40);
    expect(candidates.every((c) => c.reasons.some((r) => r.severity === "blocking"))).toBe(true);
  });

  it("image audit: 445 rows, 9 storefront main images below 500 px, every original hash recorded", async () => {
    const { analyzeImages, loadImageRows } = await import("@/lib/seo/image-audit");
    const rows = await loadImageRows(db!);
    const { summary } = analyzeImages(rows);
    expect(summary.total).toBe(445);
    expect(summary.mainBelow500).toBe(9);
    expect(summary.publicBelow500).toBe(16);
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.sha256))).toBe(true);
  });

  it("route inventory: 40 public products, 125 legacy 301 redirects, #208 as a 307", async () => {
    const { buildInventory } = await import("@/lib/seo/inventory");
    const inv = await buildInventory(db!, { seoLocales: ["tr"], verified: true });
    expect(inv.filter((e) => e.kind === "product")).toHaveLength(40);
    expect(inv.filter((e) => e.kind === "legacy-redirect" && e.status === 301)).toHaveLength(125);
    expect(inv.filter((e) => e.kind === "held-product").map((e) => e.status)).toEqual([307]);
  });
});
