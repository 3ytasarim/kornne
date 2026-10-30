import legacyRedirects from "@/data/redirects.json";
import { prisma } from "@/lib/db";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";

/**
 * Redirect lookup for the proxy: active rows of the DB Redirect table (imported from the audit map, updated by
 * Admin › Catalog QA approvals) over the static audit JSON (fallback when the DB is unreachable).
 * Memoised for 60 s per process — one query per minute, not per request.
 */
type Target = { to: string; status: number };
const STATIC = new Map<string, Target>(Object.entries(legacyRedirects as Record<string, string>).map(([from, to]) => [from, { to, status: 301 }]));
const TTL_MS = 60_000;
// on globalThis: the proxy and the app (server actions) are separate bundles in the SAME Node process
const g = globalThis as unknown as { __kornneRedirects?: { at: number; map: Promise<Map<string, Target>> } | null };

async function loadFromDb(): Promise<Map<string, Target>> {
  if (!prisma) return STATIC;
  try {
    const rows = await prisma.redirect.findMany({ where: { active: true }, select: { fromPath: true, toPath: true, statusCode: true } });
    const map = new Map(STATIC);
    for (const r of rows) map.set(r.fromPath, { to: r.toPath, status: r.statusCode === 302 || r.statusCode === 307 || r.statusCode === 308 ? r.statusCode : 301 });
    // Products held for review (e.g. legacy #208): their URLs stay alive with a TEMPORARY redirect to the primary
    // category until an editor decides — no 404, no accidental public page.
    const held = await prisma.product.findMany({
      where: { OR: [{ needsReview: true }, { status: { not: "PUBLISHED" } }] },
      select: { translations: { select: { locale: true, slug: true } }, categories: { where: { isPrimary: true }, select: { category: { select: { translations: { select: { locale: true, slug: true } } } } } } },
    });
    for (const p of held) {
      const cats = p.categories[0]?.category.translations ?? [];
      for (const t of p.translations) {
        const loc = t.locale as Locale;
        const cat = cats.find((c) => c.locale === loc);
        map.set(localizePath(loc, `/urun/${t.slug}`), { to: cat ? localizePath(loc, `/kategori/${cat.slug}`) : localizePath(loc, "/"), status: 307 });
      }
    }
    return map;
  } catch {
    return STATIC;
  }
}

export async function findRedirect(path: string): Promise<Target | undefined> {
  if (!g.__kornneRedirects || Date.now() - g.__kornneRedirects.at > TTL_MS) g.__kornneRedirects = { at: Date.now(), map: loadFromDb() };
  const map = await g.__kornneRedirects.map;
  return map.get(path) ?? map.get(path.replace(/\/$/, "")) ?? (path.endsWith("/") ? undefined : map.get(`${path}/`));
}

/** Drop the memo after an admin change so the new target is used immediately in this process. */
export function invalidateRedirects() {
  g.__kornneRedirects = null;
}
