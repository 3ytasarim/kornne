/**
 * "En çok satan" products — exactly the cards that carried the legacy "En Çok Satan" sticker
 * (upload/1644837286-620a39a65e3f2.jpeg, class="etiket") in the kornne.com crawl of 21.10.2026 (data/source-crawl/html).
 * Legacy Turkish slugs. The legacy "Fırsat Ürünü" / "Büyük Fırsat Ürünü" stickers are intentionally not carried over
 * (they implied discounts; old/strike-through prices are not shown — client decision 23.10.2026).
 */
export const BESTSELLER_SLUGS: ReadonlySet<string> = new Set([
  "monoray-kancasi-buyuk-bas",
  "ikiz-ray-kantar",
  "ikiz-ray-kancasi-paslanmaz",
  "kurban-kanama-kancasi",
  "sulu-sterilizator",
  "ayak-ve-boynuz-testeresi",
  "testere-serit",
  "kurban-testeresi",
  "kasap-ozel-kancalar-tip-2",
  "kasap-ozel-kancalar-tip-1",
  "kasap-deri-yuzme-bicak",
  "monoray-kurban-kancasi",
  "ikizray-kurban-kancasi",
  "sterilizator-dolap",
  "kucuk-bas-stoklama-kancasi",
  "platformlar",
  "balansor-70-80-kg-3mt",
]);

export const isBestseller = (p: { slugs: Partial<Record<string, string>>; slug: string }) => BESTSELLER_SLUGS.has(p.slugs.tr ?? p.slug);
