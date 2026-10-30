import type { PrismaClient } from "@prisma/client";
import { writeAuditLogVia } from "@/lib/audit-log";
import { suggestSeo } from "@/lib/seo/suggest";

/**
 * Bulk "fill empty SEO fields" for product translations (Admin › SEO). Only EMPTY seoTitle / seoDescription values are
 * written — anything an editor typed is never overwritten. Suggestions come from the product's own title, primary
 * category name (same locale) and description (src/lib/seo/suggest.ts). One audit entry with the counts.
 */
export async function fillEmptyProductSeo(db: PrismaClient, actor: { id: string }, opts: { dryRun?: boolean } = {}) {
  const rows = await db.productTranslation.findMany({
    where: { OR: [{ seoTitle: null }, { seoTitle: "" }, { seoDescription: null }, { seoDescription: "" }], product: { status: { not: "ARCHIVED" } } },
    select: {
      id: true,
      locale: true,
      title: true,
      shortDescription: true,
      descriptionHtml: true,
      seoTitle: true,
      seoDescription: true,
      product: { select: { categories: { orderBy: { isPrimary: "desc" }, take: 1, select: { category: { select: { translations: { select: { locale: true, name: true } } } } } } } },
    },
  });
  let titles = 0;
  let descriptions = 0;
  const preview: { locale: string; title: string; seoTitle: string; seoDescription: string }[] = [];
  for (const r of rows) {
    const category = r.product.categories[0]?.category.translations.find((t) => t.locale === r.locale)?.name ?? null;
    const s = suggestSeo({ locale: r.locale, title: r.title, category, shortDescription: r.shortDescription, descriptionHtml: r.descriptionHtml });
    const data: { seoTitle?: string; seoDescription?: string } = {};
    if (!r.seoTitle?.trim()) data.seoTitle = s.seoTitle;
    if (!r.seoDescription?.trim()) data.seoDescription = s.seoDescription;
    if (data.seoTitle) titles++;
    if (data.seoDescription) descriptions++;
    if (preview.length < 5) preview.push({ locale: r.locale, title: r.title, seoTitle: data.seoTitle ?? r.seoTitle ?? "", seoDescription: data.seoDescription ?? r.seoDescription ?? "" });
    if (!opts.dryRun && (data.seoTitle || data.seoDescription)) await db.productTranslation.update({ where: { id: r.id }, data });
  }
  if (!opts.dryRun) await writeAuditLogVia(db, { actorId: actor.id, action: "seo.bulk_fill_empty", entityType: "ProductTranslation", after: { translations: rows.length, titles, descriptions } });
  return { translations: rows.length, titles, descriptions, preview };
}
