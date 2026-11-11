import type { PrismaClient } from "@prisma/client";
import { canonicalRedirectTarget, resolvePublicPath } from "@/lib/i18n/routes";

/**
 * Old Merchant item_id → new product mapping PREVIEW (Sprint 9). Input: a CSV exported read-only from the existing
 * Merchant Center account (columns like "id"/"item_id"/"offer id", "title", "link", "language", "feed label").
 * Nothing is written: the result lists matches, duplicates, conflicts and unmatched rows for a human decision.
 * Matching evidence, strongest first: (1) link → legacy redirect / current slug, (2) the legacy product number
 * contained in the id (e.g. "urun-80", "80_tr"). An id is NEVER re-generated: existing ids must be kept.
 */
export type MappingRow = { line: number; offerId: string; title: string; link: string; language: string; feedLabel: string };
export type MappingResult = {
  rows: number;
  matched: { line: number; offerId: string; productId: string; ref: string; title: string; by: "link" | "id-number"; language: string; feedLabel: string }[];
  unmatched: { line: number; offerId: string; title: string; link: string; reason: string }[];
  duplicates: { offerId: string; lines: number[] }[];
  conflicts: { kind: "link-vs-id" | "many-ids-one-product"; detail: string }[];
  errors: string[];
};

const MAX_ROWS = 5000;

export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  const sep = (src.split(/\r?\n/)[0] ?? "").includes("\t") ? "\t" : (src.split(/\r?\n/)[0] ?? "").split(";").length > (src.split(/\r?\n/)[0] ?? "").split(",").length ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim()));
}

export function readMappingRows(text: string): { rows: MappingRow[]; errors: string[] } {
  const table = parseCsv(text);
  const head = (table[0] ?? []).map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, " "));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iId = col("id", "item id", "offer id", "offerid");
  if (iId < 0) return { rows: [], errors: ["CSV'de 'id' / 'item_id' / 'offer id' sütunu yok"] };
  const iTitle = col("title", "başlık");
  const iLink = col("link", "landing page", "url");
  const iLang = col("language", "content language", "dil");
  const iLabel = col("feed label", "target country", "country");
  const errors: string[] = [];
  if (table.length - 1 > MAX_ROWS) errors.push(`${table.length - 1} satır — yalnız ilk ${MAX_ROWS} işlendi`);
  const rows = table.slice(1, MAX_ROWS + 1).map((r, i) => ({ line: i + 2, offerId: (r[iId] ?? "").trim(), title: iTitle >= 0 ? (r[iTitle] ?? "").trim() : "", link: iLink >= 0 ? (r[iLink] ?? "").trim() : "", language: iLang >= 0 ? (r[iLang] ?? "").trim().toLowerCase() : "", feedLabel: iLabel >= 0 ? (r[iLabel] ?? "").trim().toUpperCase() : "" }));
  return { rows: rows.filter((r) => r.offerId), errors };
}

export async function previewMapping(db: PrismaClient, text: string): Promise<MappingResult> {
  const { rows, errors } = readMappingRows(text);
  const [products, redirects] = await Promise.all([
    db.product.findMany({ select: { id: true, sourceKey: true, translations: { select: { locale: true, slug: true, title: true } } } }),
    db.redirect.findMany({ where: { active: true }, select: { fromPath: true, toPath: true } }),
  ]);
  const byRef = new Map(products.map((p) => [(p.sourceKey ?? "").split(":").pop() ?? "", p]));
  const bySlug = new Map(products.flatMap((p) => p.translations.map((t) => [`${t.locale}:${t.slug}`, p] as const)));
  const redirect = new Map(redirects.map((r) => [r.fromPath, r.toPath]));
  const productForPath = (path: string) => {
    // feed links / redirect targets may use the pre-2026-11 scheme (bare Turkish paths) → today's URL first
    const target = canonicalRedirectTarget(redirect.get(path) ?? redirect.get(path.replace(/\/$/, "")) ?? path);
    const { locale, internalPath } = resolvePublicPath(target);
    const m = internalPath.match(/^\/urun\/([^/]+)$/);
    return m ? bySlug.get(`${locale}:${m[1]}`) : undefined;
  };
  const res: MappingResult = { rows: rows.length, matched: [], unmatched: [], duplicates: [], conflicts: [], errors };
  const seen = new Map<string, number[]>();
  for (const r of rows) seen.set(`${r.offerId}|${r.language}|${r.feedLabel}`, [...(seen.get(`${r.offerId}|${r.language}|${r.feedLabel}`) ?? []), r.line]);
  for (const [k, lines] of seen) if (lines.length > 1) res.duplicates.push({ offerId: k.split("|")[0]!, lines });

  for (const r of rows) {
    let viaLink: (typeof products)[number] | undefined;
    if (r.link) {
      try {
        viaLink = productForPath(decodeURIComponent(new URL(r.link).pathname));
      } catch {
        /* invalid URL */
      }
    }
    const num = r.offerId.match(/(?:^|[^0-9])(\d{1,7})(?:[^0-9]|$)/)?.[1];
    const viaId = num ? byRef.get(num) : undefined;
    if (viaLink && viaId && viaLink.id !== viaId.id) res.conflicts.push({ kind: "link-vs-id", detail: `satır ${r.line}: ${r.offerId} bağlantısı #${(viaLink.sourceKey ?? "").split(":").pop()} ürününü, id numarası #${num} ürününü gösteriyor` });
    const p = viaLink ?? viaId;
    if (!p) {
      res.unmatched.push({ line: r.line, offerId: r.offerId, title: r.title, link: r.link, reason: r.link ? "bağlantı bilinen bir ürüne/yönlendirmeye gitmiyor" : "bağlantı yok ve id'de eski ürün numarası yok" });
      continue;
    }
    res.matched.push({ line: r.line, offerId: r.offerId, productId: p.id, ref: (p.sourceKey ?? p.id).split(":").pop()!, title: p.translations.find((t) => t.locale === "tr")?.title ?? "", by: viaLink ? "link" : "id-number", language: r.language, feedLabel: r.feedLabel });
  }
  const perProduct = new Map<string, Set<string>>();
  for (const m of res.matched) perProduct.set(`${m.productId}|${m.language}|${m.feedLabel}`, (perProduct.get(`${m.productId}|${m.language}|${m.feedLabel}`) ?? new Set()).add(m.offerId));
  for (const [k, ids] of perProduct) if (ids.size > 1) res.conflicts.push({ kind: "many-ids-one-product", detail: `${res.matched.find((m) => `${m.productId}|${m.language}|${m.feedLabel}` === k)?.title ?? k}: ${[...ids].join(", ")} (aynı dil/feedLabel'da birden fazla id)` });
  return res;
}
