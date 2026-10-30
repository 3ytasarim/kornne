// Legacy URL → new URL map ("same slug whenever possible").
// Outputs docs/audit/redirect-map.csv (every crawled legacy URL + its fate) and src/data/redirects.json
// (only real 301s, consumed by src/proxy.ts until the DB Redirect table takes over in Sprint 2/8).
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const PAGE_SIZE = 24; // must match src/lib/catalog/pagination.ts
const catalog = JSON.parse(readFileSync(join(ROOT, "src/data/source-snapshot/catalog.json"), "utf8"));
const lmap = JSON.parse(readFileSync(join(ROOT, "src/data/source-snapshot/locale-map.json"), "utf8"));

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  const [hdr, ...data] = rows;
  return data.map((r) => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ""])));
}
const cell = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));
const pages = parseCsv(readFileSync(join(ROOT, "docs/audit/page-inventory.csv"), "utf8"));

const SEG = {
  tr: { urun: "urun", kategori: "kategori", sayfa: "sayfa", iletisim: "iletisim" },
  en: { urun: "product", kategori: "category", sayfa: "page", iletisim: "contact" },
  fr: { urun: "produit", kategori: "categorie", sayfa: "page", iletisim: "contact" },
  ru: { urun: "produkt", kategori: "kategoriya", sayfa: "stranica", iletisim: "kontakty" },
  ar: { urun: "product", kategori: "category", sayfa: "page", iletisim: "contact" },
};
const pre = (l) => (l === "tr" ? "" : `/${l}`);
const loc = (l, seg, slug) => `${pre(l)}/${SEG[l][seg]}${slug ? `/${slug}` : ""}`;

// category legacy slug → { locale, newSlug, key }
const catByLegacy = new Map();
for (const c of lmap.categories) for (const [l, v] of Object.entries(c.locales)) if (!catByLegacy.has(v.legacySlug)) catByLegacy.set(v.legacySlug, { l, slug: v.slug, key: c.key });
const counts = Object.fromEntries(lmap.categories.map((c) => [c.key, c.key === "tum-urunler" ? catalog.products.length : catalog.products.filter((p) => p.categories.includes(c.key)).length]));
const UTILITY_SPRINT = { "giris-yap": 5, "kayit-ol": 5, "sifremi-unuttum": 5, sepetim: 5, favorilerim: 5, "siparisim-ne-durumda": 5, "odeme-bildirimi": 5, "banka-hesaplari": 7, blog: 7, hesabim: 5 };
// legacy CMS slug → new slug in that locale (must match src/lib/content/pages.ts)
const CMS = { kurumsal: "kurumsal", "corporate-information": "corporate-information", "information-dentreprise": "information-dentreprise", "lang-russian-corparate": "o-kompanii", "lang-arabic-corparate": "about-us" };
const LEGAL = new Set(["iade-ve-geri-odeme-politikalari", "mesafeli-satis-sozlesmesi", "kisisel-verilenin-korunmasi-kanunu"]);
const LANG_HOME = { "lang-eng/": "/en", "lang-fr/": "/fr", "lang-ru/": "/ru", "lang-arabic/": "/ar", "tr/": "/" };

const rows = [];
const redirects = {};
const add = (r) => {
  rows.push(r);
  if (r.status === "301") {
    if (redirects[r.old_path] && redirects[r.old_path] !== r.new_path) r.note = `${r.note ?? ""} COLLISION: also used by another locale; first mapping kept`.trim();
    else redirects[r.old_path] = r.new_path;
  }
};

const seen = new Set();
for (const p of pages) {
  const path = decodeURI(new URL(p.url).pathname);
  const key = `${path}`;
  const lang = p.session_lang;
  if (seen.has(`${lang}:${key}`)) continue;
  seen.add(`${lang}:${key}`);
  const base = { old_url: p.url, old_path: path, session_lang: lang, page_type: p.page_type, title: p.title };
  const rel = path.replace(/^\//, "");

  if (rel === "") { add({ ...base, new_path: "/", status: "200-same", note: "" }); continue; }
  if (LANG_HOME[rel]) { add({ ...base, new_path: LANG_HOME[rel], status: "301", note: "session-based language switch → prefixed locale home" }); continue; }

  const [seg, slug, pageNo] = rel.split("/");
  if (seg === "kategori") {
    const c = catByLegacy.get(slug);
    if (!c) { add({ ...base, new_path: "", status: "unmapped", note: "unknown category" }); continue; }
    const target = loc(lang, "kategori", (lmap.categories.find((x) => x.key === c.key).locales[lang] ?? {}).slug ?? c.slug);
    if (pageNo) {
      const n = +pageNo;
      const pagesNew = Math.max(1, Math.ceil(counts[c.key] / PAGE_SIZE));
      if (n <= 1) add({ ...base, new_path: target, status: "301", note: "duplicate of page 1 (/1)" });
      else if (n <= pagesNew && lang === "tr") add({ ...base, new_path: path, status: "200-same", note: `page ${n} of ${pagesNew} (page size ${PAGE_SIZE})` });
      else add({ ...base, new_path: lang === "tr" && n <= pagesNew ? path : target, status: "301", note: `legacy page ${n}; new listing has ${pagesNew} page(s) of ${PAGE_SIZE}` });
      continue;
    }
    add({ ...base, new_path: target, status: target === path ? "200-same" : "301", note: lang === "tr" ? "" : `legacy ${lang} URL (only reachable with a session cookie)` });
    continue;
  }
  if (seg === "urun") {
    if (lang === "tr") { add({ ...base, new_path: path, status: "200-same", note: "" }); continue; }
    const t = catalog.translations.find((x) => x.locale === lang && x.slug === slug);
    // Sprint 2: EN/FR records are separate products whose match to a TR product is only SUGGESTED. Until an editor
    // approves the match (Admin › Catalog QA), the legacy URL goes to that locale's "all products" listing; approval
    // rewrites the DB Redirect row to the product URL. The suggested target is kept in the note.
    const allSlug = lmap.categories.find((c) => c.isAllProducts).locales[lang]?.slug;
    add({ ...base, new_path: t && allSlug ? loc(lang, "kategori", allSlug) : "", status: t ? "301" : "unmapped", note: t ? `separate legacy ${lang} record; suggested product target ${loc(lang, "urun", slug)} pending match approval` : "" });
    continue;
  }
  if (seg === "sayfa") {
    if (lang === "tr") { add({ ...base, new_path: path, status: CMS[slug] || LEGAL.has(slug) ? "200-same" : "unmapped", note: LEGAL.has(slug) ? "legal text served noindex until legal approval (Sprint 7)" : "" }); continue; }
    add({ ...base, new_path: CMS[slug] ? loc(lang, "sayfa", CMS[slug]) : "", status: CMS[slug] ? "301" : "unmapped", note: "legacy corporate page (empty body on source)" });
    continue;
  }
  if (seg === "iletisim") { add({ ...base, new_path: lang === "tr" ? path : loc(lang, "iletisim"), status: lang === "tr" ? "200-same" : "n/a", note: lang === "tr" ? "" : "same legacy URL for every language (session)" }); continue; }
  if (UTILITY_SPRINT[seg] !== undefined) { add({ ...base, new_path: path, status: "planned", note: `keep same path; feature lands in Sprint ${UTILITY_SPRINT[seg]}` }); continue; }
  add({ ...base, new_path: "", status: "unmapped", note: "" });
}

// legacy media: same path (/upload/<name>) is preserved → no redirect needed
rows.push({ old_url: "https://kornne.com/upload/*", old_path: "/upload/*", session_lang: "*", page_type: "media", title: "", new_path: "/upload/*", status: "200-same", note: "originals served byte-identical under the same path" });
rows.push({ old_url: "https://www.kornne.com/*", old_path: "*", session_lang: "*", page_type: "host", title: "", new_path: "https://kornne.com/*", status: "301", note: "keep: legacy host redirects www → apex (302 today; make it 301 at Nginx)" });

const cols = ["old_url", "old_path", "session_lang", "page_type", "title", "new_path", "status", "note"];
writeFileSync(join(ROOT, "docs/audit/redirect-map.csv"), [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n") + "\n");
writeFileSync(join(ROOT, "src/data/redirects.json"), JSON.stringify(redirects, null, 1) + "\n");
const by = rows.reduce((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
console.log(JSON.stringify(by), "redirects:", Object.keys(redirects).length);
