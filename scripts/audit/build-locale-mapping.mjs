// The source shop stores every language as a SEPARATE product record (TR ids 78-217, EN 140-176, FR 177-216;
// RU/AR have categories but no products). There is no shared key: images were re-uploaded per language and the
// JSON-LD "sku" values follow different schemes. This table is a MANUAL, SUGGESTED mapping (record creation order
// + title meaning) and must be confirmed by the client before Sprint 2 imports translations.
// Usage: node scripts/audit/build-locale-mapping.mjs   (reads docs/audit/product-inventory.csv)
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
// [tr_id, en_id | null, fr_id | null]
const MAP = [
  [78, 140, 177], [79, 141, 178], [80, 142, 179], [82, 143, 180], [84, 144, 181], [85, 145, 182], [86, 146, 183],
  [100, 147, 184], [103, 148, 185], [104, 149, 186], [105, 150, 187], [107, 151, 188], [108, 152, 189], [109, 153, 190],
  [110, 154, 191], [111, 155, 192], [112, 156, 193], [113, 157, 194], [114, 158, 195], [115, 159, 196], [117, 160, 197],
  [118, 161, 198], [119, 162, 199], [120, null, 200], [121, 163, 201], [122, 164, 202], [123, 165, 203], [124, 166, 204],
  [125, 167, 205], [126, null, 206], [127, 169, 207], [128, 170, 210], [130, 171, 211], [131, 172, 212], [134, 173, 213],
  [135, 174, 214], [136, 175, 215], [137, 176, 216], [208, null, null], [209, null, null], [217, null, null],
];

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [hdr, ...data] = rows;
  return data.map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ""])));
}
const cell = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));

const inv = parseCsv(readFileSync(join(ROOT, "docs/audit/product-inventory.csv"), "utf8"));
const byId = new Map(inv.map((r) => [`${r.locale}:${r.source_id}`, r]));
const used = { en: new Set(), fr: new Set() };
const out = [["tr_source_id", "tr_title", "tr_price", "en_source_id", "en_title", "en_price", "fr_source_id", "fr_title", "fr_price", "price_consistent", "method", "status"].join(",")];
for (const [tr, en, fr] of MAP) {
  const t = byId.get(`tr:${tr}`), e = en && byId.get(`en:${en}`), f = fr && byId.get(`fr:${fr}`);
  if (!t) throw new Error(`tr:${tr} not in inventory`);
  if (en && !e) throw new Error(`en:${en} not in inventory`);
  if (fr && !f) throw new Error(`fr:${fr} not in inventory`);
  if (en) used.en.add(String(en));
  if (fr) used.fr.add(String(fr));
  const prices = [t.price, e?.price, f?.price].filter(Boolean);
  out.push([tr, t.title, t.price, en ?? "", e?.title ?? "", e?.price ?? "", fr ?? "", f?.title ?? "", f?.price ?? "", new Set(prices).size <= 1 ? "yes" : "NO", "record-order+title (manual)", "suggested — client confirmation required"].map(cell).join(","));
}
for (const l of ["en", "fr"]) {
  const orphans = inv.filter((r) => r.locale === l && !used[l].has(r.source_id));
  if (orphans.length) throw new Error(`unmapped ${l}: ${orphans.map((o) => o.source_id).join(",")}`);
}
writeFileSync(join(ROOT, "docs/audit/locale-product-mapping.csv"), out.join("\n") + "\n");

// Categories: legacy slugs per locale (names come from page-inventory). RU/AR legacy slugs are generic
// ("lang-russian-robotics" is actually "All products"), so new clean slugs are PROPOSED for them; legacy → 301.
const CATEGORIES = [
  { key: "mezbaha-ekipmanlari", legacy: { tr: "mezbaha-ekipmanlari", en: "slaughterhouse-equipments", fr: "equipements-dabattoir", ru: "lang-russian-equipments", ar: "lang-arabic-equipments" }, proposed: { ru: "oborudovanie-dlya-skotoboyni", ar: "slaughterhouse-equipment" } },
  { key: "kurban-ekipmanlari", legacy: { tr: "kurban-ekipmanlari", en: "sacrifice-equipments", fr: "equipements-de-sacrifice", ru: "lang-russian-equipments2", ar: "lang-arabic-equipments2" }, proposed: { ru: "oborudovanie-dlya-zhertvoprinosheniya", ar: "sacrifice-equipment" } },
  { key: "robotik-sistemler", legacy: { tr: "robotik-sistemler", en: "robotic-systems", fr: "systemes-robotiques", ru: "lang-russian-equipments3", ar: "lang-arabic-robotics" }, proposed: { ru: "robototekhnicheskie-sistemy", ar: "robotic-systems" } },
  { key: "tum-urunler", legacy: { tr: "tum-urunler", en: "all-products", fr: "all-products", ru: "lang-russian-robotics", ar: "lang-arabic-equipments3" }, proposed: { fr: "tous-les-produits", ru: "vse-produkty", ar: "all-products" } },
];
const pages = parseCsv(readFileSync(join(ROOT, "docs/audit/page-inventory.csv"), "utf8"));
const categories = CATEGORIES.map((c) => ({
  key: c.key,
  isAllProducts: c.key === "tum-urunler",
  locales: Object.fromEntries(
    Object.entries(c.legacy).map(([l, slug]) => {
      const page = pages.find((p) => p.page_type === "category" && p.session_lang === l && p.url === `https://kornne.com/kategori/${slug}`);
      return [l, { legacySlug: slug, slug: c.proposed[l] ?? slug, name: page?.title ?? "", sourceUrl: page?.url ?? "" }];
    }),
  ),
}));
const products = MAP.map(([tr, en, fr]) => ({ tr: String(tr), en: en ? String(en) : null, fr: fr ? String(fr) : null }));
writeFileSync(
  join(ROOT, "src/data/source-snapshot/locale-map.json"),
  JSON.stringify({ _meta: { status: "suggested — client confirmation required", method: "record order + title meaning + price agreement" }, categories, products }, null, 1) + "\n",
);
const rows = out.slice(1);
console.log(`rows=${rows.length} price_inconsistent=${rows.filter((r) => r.includes(",NO,")).length}`);
