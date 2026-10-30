import "server-only";
import { revalidatePath } from "next/cache";
import { invalidateCatalog } from "@/lib/catalog";
import { invalidateContent } from "@/lib/cms/store";
import { invalidateRedirects } from "@/lib/redirects";

/**
 * Targeted storefront invalidation after admin writes. Route patterns (not "/" layout-wide) so one product edit
 * does not force a regeneration of every page. Returns the list of patterns that FAILED (reported to the editor and
 * written to the audit log by the caller) — the DB change itself is already committed at this point.
 */
const PATTERNS = {
  product: ["/[locale]/urun/[slug]", "/[locale]/kategori/[slug]", "/[locale]/kategori/[slug]/[page]", "/[locale]/arama", "/[locale]"],
  category: ["/[locale]/kategori/[slug]", "/[locale]/kategori/[slug]/[page]", "/[locale]", "/[locale]/urun/[slug]"],
  content: ["/[locale]/sayfa/[slug]", "/[locale]/blog", "/[locale]/blog/[slug]", "/[locale]/sss", "/[locale]"],
  layout: ["/[locale]"],
} as const;

export type RevalidateScope = keyof typeof PATTERNS;

export function revalidateStorefront(scope: RevalidateScope, opts: { layout?: boolean } = {}): string[] {
  const failed: string[] = [];
  if (scope === "product" || scope === "category") invalidateCatalog();
  if (scope === "content" || scope === "layout") invalidateContent();
  invalidateRedirects();
  for (const p of PATTERNS[scope]) {
    try {
      revalidatePath(p, "page");
    } catch {
      failed.push(p);
    }
  }
  if (opts.layout) {
    // header/footer/menus/contact are rendered by the locale layout
    try {
      revalidatePath("/[locale]", "layout");
    } catch {
      failed.push("/[locale] (layout)");
    }
  }
  return failed;
}
