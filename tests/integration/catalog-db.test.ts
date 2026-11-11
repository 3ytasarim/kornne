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

  // the site is live since 2026-10: prices are approved in the admin, so only the invariants are checked here
  it("every verified price carries its VAT treatment; legacy rows keep their raw strings", async () => {
    expect(await db!.price.count({ where: { status: "VERIFIED", OR: [{ vatIncluded: null }, { vatRateBp: null }] } })).toBe(0);
    expect(await db!.price.count({ where: { source: "LEGACY_IMPORT", rawAmount: null } })).toBe(0);
  });

  // live data since 2026-10 (editors publish / hold products in the admin) → invariants instead of fixed counts
  it("there are public products and every held product is excluded from the storefront list", async () => {
    expect(await db!.product.count({ where: { status: "PUBLISHED", needsReview: false } })).toBeGreaterThan(0);
    const { prismaRepository } = await import("@/lib/catalog/prisma-repository");
    const held = (await db!.product.findMany({ where: { needsReview: true }, select: { sourceKey: true } })).map((p) => (p.sourceKey ?? "").split(":").pop());
    const listed = (await prismaRepository.listProducts("tr")).map((p) => p.sourceId);
    expect(listed.filter((id) => held.includes(id))).toEqual([]);
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
  it("Merchant readiness: no storefront product READY (availability unknown), #208 held, every product with its reasons", async () => {
    const { evaluateCatalog } = await import("@/lib/merchant/facts");
    const { candidates, ready, held, byReason } = await evaluateCatalog(db!, {});
    expect(candidates.length).toBeGreaterThan(0);
    expect(ready).toHaveLength(0);
    expect(held.length).toBe(await db!.product.count({ where: { needsReview: true, status: { not: "ARCHIVED" } } }));
    expect(byReason.AVAILABILITY_UNKNOWN).toBe(candidates.length);
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

  it("route inventory: every public product, 125 legacy 301 redirects, held products as 307", async () => {
    const { buildInventory } = await import("@/lib/seo/inventory");
    const inv = await buildInventory(db!, { seoLocales: ["tr"], verified: true });
    const publicTr = await db!.productTranslation.count({ where: { locale: "tr", product: { status: "PUBLISHED", needsReview: false } } });
    expect(inv.filter((e) => e.kind === "product" && e.path.startsWith("/tr/urun/"))).toHaveLength(publicTr);
    expect(inv.filter((e) => e.kind === "legacy-redirect" && e.status === 301)).toHaveLength(125);
    expect(inv.filter((e) => e.kind === "held-product").every((e) => e.status === 307)).toBe(true);
  });
});
