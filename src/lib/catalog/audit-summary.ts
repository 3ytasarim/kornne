import "server-only";
import catalog from "@/data/source-snapshot/catalog.json";
import mapping from "@/data/source-snapshot/locale-map.json";
import redirects from "@/data/redirects.json";

/** Figures from the Sprint 0 audit snapshot, for the admin dashboard (read-only, unverified source data). */
export function auditSummary() {
  const flagCounts: Record<string, number> = {};
  for (const p of catalog.products) for (const f of p.flags) {
    const k = f.replace(/\(.*$/, "");
    flagCounts[k] = (flagCounts[k] ?? 0) + 1;
  }
  return {
    capturedAt: catalog._meta.captured_at,
    trProducts: catalog.products.length,
    enProducts: catalog.translations.filter((t) => t.locale === "en").length,
    frProducts: catalog.translations.filter((t) => t.locale === "fr").length,
    ruProducts: catalog.translations.filter((t) => t.locale === "ru").length,
    arProducts: catalog.translations.filter((t) => t.locale === "ar").length,
    images: catalog.products.reduce((a, p) => a + p.images.length, 0),
    redirects: Object.keys(redirects).length,
    categories: mapping.categories.length,
    flagCounts,
  };
}
