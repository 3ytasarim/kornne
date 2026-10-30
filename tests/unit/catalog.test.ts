import { describe, expect, it } from "vitest";
import { snapshotRepository as repo } from "@/lib/catalog/snapshot-repository";
import { ENABLED_LOCALES } from "@/lib/i18n/config";

describe("snapshot catalog (Sprint 0 inventory)", () => {
  it("contains the 41 Turkish products found on kornne.com", async () => {
    expect(await repo.listProducts("tr")).toHaveLength(41);
  });

  it("slugs are unique per locale", async () => {
    for (const l of ENABLED_LOCALES) {
      const slugs = (await repo.listProducts(l)).map((p) => p.slug);
      expect(new Set(slugs).size, l).toBe(slugs.length);
    }
  });

  it("keeps the exact legacy Turkish slugs", async () => {
    expect(await repo.getProduct("tr", "dairesel-kesim-hucresi")).not.toBeNull();
    expect(await repo.getProduct("tr", "lama-ray-kancasi-buyuk-bas")).not.toBeNull();
  });

  it("uses the Turkish record as the single price source in every locale", async () => {
    const tr = await repo.getProduct("tr", "ayakta-kesim-hucresi");
    const en = await repo.getProduct("en", "standing-slaughter-cell");
    expect(en?.priceMinor).toBe(tr?.priceMinor); // legacy EN record says 4.818,79 TL — not used
  });

  it("marks RU/AR products as untranslated and never invents translations", async () => {
    for (const p of await repo.listProducts("ru")) {
      expect(p.contentStatus).toBe("missing");
      expect(p.translatedLocales).not.toContain("ru");
    }
  });

  it("category counts match the legacy storefront listing", async () => {
    const cats = await repo.listCategories("tr");
    const count = (k: string) => cats.find((c) => c.key === k)?.productCount;
    expect(count("mezbaha-ekipmanlari")).toBe(37);
    expect(count("robotik-sistemler")).toBe(26);
    expect(count("kurban-ekipmanlari")).toBe(16);
    expect(count("tum-urunler")).toBe(41); // storefront said 40 — #208 is missing from "Tüm Ürünler"
  });

  it("search is accent/case-insensitive in Turkish", async () => {
    const r = await repo.search("tr", "DÖŞ açma");
    expect(r.map((p) => p.slugs.tr)).toContain("dos-acma-testeresi");
  });
});
