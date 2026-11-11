import { describe, expect, it } from "vitest";
import { dirOf, ENABLED_LOCALES, LOCALES } from "@/lib/i18n/config";
import { getDictionary, missingKeys } from "@/lib/i18n/dictionaries";
import { canonicalRedirectTarget, legacyTurkishPath, localizePath, resolvePublicPath } from "@/lib/i18n/routes";

describe("locale routing", () => {
  it("English is the unprefixed default (since 2026-11); Turkish lives under /tr", () => {
    expect(localizePath("en", "/urun/circular-cutting-cell")).toBe("/product/circular-cutting-cell");
    expect(localizePath("en", "/")).toBe("/");
    expect(localizePath("tr", "/urun/dairesel-kesim-hucresi")).toBe("/tr/urun/dairesel-kesim-hucresi");
    expect(localizePath("tr", "/")).toBe("/tr");
  });

  it("prefixes and translates the first segment for other locales", () => {
    expect(localizePath("de", "/urun/karkassen-spaltsaege")).toBe("/de/produkt/karkassen-spaltsaege");
    expect(localizePath("ru", "/kategori/vse-produkty")).toBe("/ru/kategoriya/vse-produkty");
    expect(localizePath("ar", "/")).toBe("/ar");
  });

  it("old unprefixed Turkish URLs map to /tr; English and prefixed URLs do not", () => {
    expect(legacyTurkishPath("/urun/dairesel-kesim-hucresi")).toBe("/tr/urun/dairesel-kesim-hucresi");
    expect(legacyTurkishPath("/kategori/tum-urunler/2")).toBe("/tr/kategori/tum-urunler/2");
    expect(legacyTurkishPath("/sayfa/kurumsal")).toBe("/tr/sayfa/kurumsal");
    for (const p of ["/", "/product/x", "/blog/x", "/tr/urun/x", "/de/produkt/x"]) expect(legacyTurkishPath(p), p).toBeNull();
    expect(canonicalRedirectTarget("/en/category/all-products")).toBe("/category/all-products");
    expect(canonicalRedirectTarget("/kategori/mezbaha-ekipmanlari")).toBe("/tr/kategori/mezbaha-ekipmanlari");
    expect(canonicalRedirectTarget("/en")).toBe("/");
  });

  it("round-trips public ↔ internal paths for every locale", () => {
    for (const l of ENABLED_LOCALES) {
      for (const p of ["/", "/urun/x", "/kategori/y", "/kategori/y/2", "/sayfa/z", "/iletisim", "/arama"]) {
        const pub = localizePath(l, p);
        const back = resolvePublicPath(pub);
        expect(back.locale).toBe(l);
        expect(back.internalPath).toBe(p);
      }
    }
  });

  it("detects a redundant /en prefix", () => {
    expect(resolvePublicPath("/en/product/x")).toEqual({ locale: "en", internalPath: "/urun/x", redundantPrefix: true });
    expect(resolvePublicPath("/tr/urun/x")).toEqual({ locale: "tr", internalPath: "/urun/x", redundantPrefix: false });
  });

  it("Arabic is RTL, the rest LTR", () => {
    expect(dirOf("ar")).toBe("rtl");
    for (const l of LOCALES.filter((x) => x !== "ar")) expect(dirOf(l)).toBe("ltr");
  });
});

describe("UI dictionaries", () => {
  it("every locale translates every key (no silent Turkish fallback in the UI)", () => {
    for (const l of ["en", "fr", "ru", "ar"] as const) expect(missingKeys(l), `${l} missing keys`).toEqual([]);
  });

  it("placeholders survive translation", () => {
    for (const l of ENABLED_LOCALES) {
      const d = getDictionary(l);
      expect(d.product.whatsappMessage).toContain("{url}");
      expect(d.category.productCount).toContain("{count}");
      expect(d.product.translationMissing).toContain("{language}");
    }
  });
});

describe("client boundary strings (Sprint 10 bundle fix)", () => {
  it("error / not-found strings equal the dictionaries in every locale, so the client bundle needs no dictionary", async () => {
    const { BOUNDARY_STRINGS } = await import("@/lib/i18n/boundary-strings");
    const { getDictionary } = await import("@/lib/i18n/dictionaries");
    const localeMap = (await import("@/data/source-snapshot/locale-map.json")).default;
    const { LOCALES } = await import("@/lib/i18n/config");
    for (const l of LOCALES) {
      const d = getDictionary(l);
      expect(BOUNDARY_STRINGS[l].error).toEqual(d.error);
      expect(BOUNDARY_STRINGS[l].notFound).toEqual(d.notFound);
      // legacy languages keep the old site's slug; languages added later (de) use the imported translation's slug
      const slug = (localeMap.categories.find((c) => c.isAllProducts)?.locales as Record<string, { slug: string }>)[l]?.slug;
      if (slug) expect(BOUNDARY_STRINGS[l].allProductsSlug).toBe(slug);
      else expect(BOUNDARY_STRINGS[l].allProductsSlug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
