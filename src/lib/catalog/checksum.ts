import { createHash } from "node:crypto";

/**
 * Checksums of importer-owned fields. The importer stores them on the rows it writes; on a later run a row whose
 * current values no longer hash to the stored checksum was edited by a human → the importer leaves it alone.
 */
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

export function translationChecksum(t: { title: string; slug: string; shortDescription?: string | null; descriptionHtml?: string | null; seoTitle?: string | null; seoDescription?: string | null }) {
  return sha256(stable({ title: t.title, slug: t.slug, shortDescription: t.shortDescription ?? null, descriptionHtml: t.descriptionHtml ?? null, seoTitle: t.seoTitle ?? null, seoDescription: t.seoDescription ?? null }));
}
export function categoryTranslationChecksum(t: { name: string; slug: string; description?: string | null }) {
  return sha256(stable({ name: t.name, slug: t.slug, description: t.description ?? null }));
}
export function altChecksum(alt: string) {
  return sha256(alt);
}
