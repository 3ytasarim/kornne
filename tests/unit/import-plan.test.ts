import { describe, expect, it } from "vitest";
import { buildPlan, decimalToMinor, hasMojibake, planChecks } from "../../scripts/import/lib/plan";
import { loadSources } from "../../scripts/import/lib/sources";
import { translationChecksum } from "@/lib/catalog/checksum";

const plan = buildPlan(loadSources());
const checks = planChecks(plan);

describe("import plan — inventory reconciliation", () => {
  it("keeps all 41 Turkish source products, 40 public + #208 held for review", () => {
    expect(checks.products).toBe(41);
    expect(checks.publishedProducts).toBe(40);
    expect(checks.heldForReview).toEqual(["208 İkizray Kurban Kancası"]);
  });

  it("does not merge EN/FR records into products: 36 + 38 suggestions, none unmatched", () => {
    expect(plan.matches.filter((m) => m.sourceLocale === "en")).toHaveLength(36);
    expect(plan.matches.filter((m) => m.sourceLocale === "fr")).toHaveLength(38);
    expect(plan.unmatchedLegacy).toEqual([]);
    // every EN/FR legacy record is preserved as provenance
    const perLocale = (l: string) => plan.legacyRecords.filter((r) => r.entityType === "product" && r.locale === l).length;
    expect([perLocale("tr"), perLocale("en"), perLocale("fr")]).toEqual([41, 36, 38]);
  });

  it("has no RU/AR product records (only category names)", () => {
    expect(plan.legacyRecords.some((r) => r.entityType === "product" && (r.locale === "ru" || r.locale === "ar"))).toBe(false);
    expect(checks.arabicCategoryNames).toBe(4);
  });

  it("445 media assets, 6 missing at source, no duplicate keys", () => {
    expect(checks.mediaAssets).toBe(445);
    expect(checks.missingMedia).toBe(6);
    expect(checks.duplicateMediaKeys).toEqual([]);
    expect(checks.duplicateMediaPaths).toEqual([]);
    expect(checks.brokenProductImages).toEqual(["80: https://kornne.com/upload/Kornne-Klasik-Kesim-Hucre-61.jpg"]);
  });

  it("flags the 6 invalid discounts and 11 cross-language price conflicts", () => {
    expect(checks.invalidDiscounts.sort()).toEqual(["104", "135", "136", "208", "209", "217"]);
    const conflicted = new Set(plan.matches.filter((m) => !m.evidence.priceEqual).map((m) => m.productSourceKey));
    expect(conflicted.size).toBe(11);
  });

  it("keeps raw legacy price strings and never marks a price verified", () => {
    const p = plan.products.find((x) => x.legacyId === "78")!;
    expect(p.price).toMatchObject({ amountMinor: 180747994n, compareAtMinor: 190342205n, rawAmount: "1.807.479,94 TL", rawCompareAt: "1.903.422,05 TL" });
    expect(p.price!.reviewReasons).toContain("vat_unknown");
  });

  it("125 single-source legacy redirects; EN/FR product URLs wait for match approval", () => {
    expect(plan.redirects).toHaveLength(125);
    expect(plan.redirects.find((r) => r.fromPath === "/urun/circular-cutting-cell")?.toPath).toBe("/en/category/all-products");
  });

  it("text is clean Unicode (NFC, no mojibake)", () => {
    expect(checks.mojibake).toBe(0);
    expect(checks.nonNfc).toBe(0);
    expect(hasMojibake("Ã¼rÃ¼n")).toBe(true);
    expect(hasMojibake("Ürün Çeşidi İ ı ş ğ")).toBe(false);
  });
});

describe("import helpers", () => {
  it("decimalToMinor accepts only clean decimals", () => {
    expect(decimalToMinor("771.01")).toBe(77101n);
    expect(decimalToMinor("771,01")).toBeNull();
    expect(decimalToMinor("")).toBeNull();
  });

  it("translation checksum detects any edit of importer-owned fields", () => {
    const a = translationChecksum({ title: "X", slug: "x", descriptionHtml: "<p>a</p>" });
    expect(translationChecksum({ title: "X", slug: "x", descriptionHtml: "<p>a</p>", shortDescription: null })).toBe(a);
    expect(translationChecksum({ title: "X!", slug: "x", descriptionHtml: "<p>a</p>" })).not.toBe(a);
  });

  it("match confidence rewards identical photo bytes and prices", () => {
    const high = plan.matches.find((m) => m.sourceLocale === "en" && m.sourceLegacyId === "140")!; // Circular Cutting Cell
    expect(high.confidence).toBeGreaterThanOrEqual(85);
    const conflict = plan.matches.find((m) => m.sourceLocale === "en" && m.sourceLegacyId === "141")!; // price 4.818,79 ≠ 1.108.321,70
    expect(conflict.evidence.priceEqual).toBe(false);
    expect(conflict.confidence).toBeLessThan(high.confidence);
  });
});
