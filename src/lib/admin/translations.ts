import type { Locale, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { translationChecksum } from "@/lib/catalog/checksum";
import { sanitizeRichText } from "@/lib/catalog/sanitize";
import { localizePath, pathVariants } from "@/lib/i18n/routes";
import { AdminError } from "./action-state";

/**
 * EN/FR legacy-record ↔ TR product matching and product-translation publishing (Sprint 7,
 * docs/i18n/translation-approval-report.md). Nothing here runs automatically:
 *  1. approve  — a human accepts a suggestion → an EDITOR DRAFT translation (IN_REVIEW, not public) is created from
 *                the verbatim legacy text. Prices are never taken from EN/FR records.
 *  2. publish  — a second step makes it public (status APPROVED) and points the legacy URL at the new page.
 *  3. unpublish — back to IN_REVIEW; the legacy URL goes back to its previous target.
 * Low-confidence suggestions need an explicit confirmation + reason; "Kurban Yatırma Kabini" needs a written
 * customer-approval reference (open question in the data-quality report).
 */
export type Actor = { id: string };
export const LOW_CONFIDENCE = 60;
const CUSTOMER_DECISION = /kurban yatırma kabini|sacrifice laying cabin|cabine de pose/i;

type Evidence = { trTitle?: string; legacyTitle?: string; legacyUrl?: string; priceEqual?: boolean };

export function matchRequirements(m: { confidence: number; evidence: unknown }) {
  const e = (m.evidence ?? {}) as Evidence;
  return {
    lowConfidence: m.confidence < LOW_CONFIDENCE,
    customerDecision: CUSTOMER_DECISION.test(`${e.trTitle ?? ""} ${e.legacyTitle ?? ""}`),
    priceConflict: e.priceEqual === false,
  };
}

const decideSchema = z.object({
  id: z.string().min(10).max(40),
  confirmLowConfidence: z.string().optional(),
  note: z.string().trim().max(500).optional(),
  customerApprovalRef: z.string().trim().max(300).optional(),
});

export async function approveMatch(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = decideSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const m = await tx.legacyMatchSuggestion.findUnique({ where: { id: v.id }, include: { product: { include: { translations: true, media: { orderBy: { sortOrder: "asc" } } } } } });
    if (!m) throw new AdminError("Öneri bulunamadı.");
    if (m.status !== "SUGGESTED") throw new AdminError("Bu öneri zaten karara bağlanmış.");
    const req = matchRequirements(m);
    if (req.lowConfidence && (v.confirmLowConfidence !== "on" || (v.note ?? "").length < 10)) throw new AdminError(`Düşük güvenli öneri (${m.confidence}/100): kontrol ettiğinizi onaylayın ve gerekçeyi yazın (en az 10 karakter).`, { note: "Gerekçe zorunlu" });
    if (req.customerDecision && (v.customerApprovalRef ?? "").length < 5) throw new AdminError("Bu eşleşme müşteri kararı gerektiriyor (Kurban Yatırma Kabini). Müşteri onayının referansını yazın.", { customerApprovalRef: "Müşteri onayı referansı zorunlu" });
    if (m.product.translations.some((t) => t.locale === m.sourceLocale)) throw new AdminError(`Ürünün ${m.sourceLocale.toUpperCase()} sürümü zaten var.`);
    // claim the decision atomically: a concurrent duplicate submission (double click, replayed pre-hydration click)
    // waits on the row lock and then finds the suggestion no longer SUGGESTED
    const claimed = await tx.legacyMatchSuggestion.updateMany({ where: { id: m.id, status: "SUGGESTED" }, data: { status: "APPROVED", decidedById: actor.id, decidedAt: new Date() } });
    if (claimed.count !== 1) throw new AdminError("Bu öneri zaten karara bağlanmış.");
    const rec = await tx.legacySourceRecord.findUniqueOrThrow({ where: { entityType_legacyId_locale: { entityType: "product", legacyId: m.sourceLegacyId, locale: m.sourceLocale } } });
    const p = rec.payload as { title: string; slug: string; description_html?: string };
    const clash = await tx.productTranslation.findUnique({ where: { locale_slug: { locale: m.sourceLocale, slug: p.slug } } });
    if (clash) throw new AdminError(`“${p.slug}” adresi ${m.sourceLocale.toUpperCase()} dilinde başka bir üründe kullanılıyor.`);
    const title = p.title.normalize("NFC");
    const descriptionHtml = p.description_html ? sanitizeRichText(p.description_html) || null : null;
    const translation = await tx.productTranslation.create({
      data: { productId: m.productId, locale: m.sourceLocale, title, slug: p.slug, descriptionHtml, status: "IN_REVIEW", legacyRecordId: `product:${m.sourceLegacyId}:${m.sourceLocale}`, importChecksum: translationChecksum({ title, slug: p.slug, descriptionHtml }) },
    });
    // alt-text drafts for that language (marked auto-generated → reviewed in the media library)
    for (const [i, pm] of m.product.media.entries()) {
      const exists = await tx.mediaTranslation.findUnique({ where: { mediaId_locale: { mediaId: pm.mediaId, locale: m.sourceLocale } } });
      if (!exists) await tx.mediaTranslation.create({ data: { mediaId: pm.mediaId, locale: m.sourceLocale, alt: i === 0 ? title : `${title} – image ${i + 1}`, autoGenerated: true } });
    }
    await tx.legacySourceRecord.update({ where: { id: rec.id }, data: { targetId: m.productId, migrationStatus: "translation_draft" } });
    const note = [v.note, v.customerApprovalRef ? `Müşteri onayı: ${v.customerApprovalRef}` : null].filter(Boolean).join(" · ") || null;
    await tx.legacyMatchSuggestion.update({ where: { id: m.id }, data: { note } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "catalog.match_approved", entityType: "LegacyMatchSuggestion", entityId: m.id, after: { locale: m.sourceLocale, legacyId: m.sourceLegacyId, productId: m.productId, translationId: translation.id, confidence: m.confidence, note, translationStatus: "IN_REVIEW" } } });
    return { title, locale: m.sourceLocale, productId: m.productId };
  });
}

export async function rejectMatch(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = decideSchema.parse(raw);
  const m = await db.legacyMatchSuggestion.findUnique({ where: { id: v.id } });
  if (!m || m.status !== "SUGGESTED") throw new AdminError("Öneri bulunamadı veya zaten karara bağlanmış.");
  await db.$transaction(async (tx) => {
    const done = await tx.legacyMatchSuggestion.updateMany({ where: { id: m.id, status: "SUGGESTED" }, data: { status: "REJECTED", decidedById: actor.id, decidedAt: new Date(), note: v.note || null } });
    if (done.count !== 1) throw new AdminError("Öneri aynı anda karara bağlandı.");
    await tx.auditLog.create({ data: { actorId: actor.id, action: "catalog.match_rejected", entityType: "LegacyMatchSuggestion", entityId: m.id, after: { locale: m.sourceLocale, legacyId: m.sourceLegacyId, productId: m.productId, note: v.note ?? null } } });
  });
}

/** A rejected suggestion can be reopened (decision undone) — only while no translation was created from it. */
export async function reopenMatch(db: PrismaClient, actor: Actor, id: string) {
  const m = await db.legacyMatchSuggestion.findUnique({ where: { id } });
  if (!m || m.status !== "REJECTED") throw new AdminError("Yalnız reddedilmiş öneriler yeniden açılabilir.");
  await db.legacyMatchSuggestion.update({ where: { id }, data: { status: "SUGGESTED", decidedById: null, decidedAt: null } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "catalog.match_reopened", entityType: "LegacyMatchSuggestion", entityId: id } });
}

/** Points a suggestion at a different TR product (manual re-match). The decision itself is still a separate step. */
export async function rematch(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ id: z.string().min(10).max(40), productId: z.string().min(10).max(40), note: z.string().trim().min(10, "Yeniden eşleştirme gerekçesini yazın.").max(500) }).parse(raw);
  const m = await db.legacyMatchSuggestion.findUnique({ where: { id: v.id } });
  if (!m || m.status === "APPROVED") throw new AdminError("Onaylanmış eşleşme yeniden eşleştirilemez.");
  const target = await db.product.findUnique({ where: { id: v.productId }, include: { translations: { select: { locale: true } } } });
  if (!target) throw new AdminError("Hedef ürün bulunamadı.");
  if (target.translations.some((t) => t.locale === m.sourceLocale)) throw new AdminError(`Hedef ürünün ${m.sourceLocale.toUpperCase()} sürümü zaten var.`);
  const evidence = { ...(m.evidence as object), rematchedFrom: m.productId, rematchedAt: new Date().toISOString() };
  await db.legacyMatchSuggestion.update({ where: { id: m.id }, data: { productId: v.productId, status: "SUGGESTED", method: "manual_rematch", evidence, note: v.note, decidedById: null, decidedAt: null } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "catalog.match_rematched", entityType: "LegacyMatchSuggestion", entityId: m.id, before: { productId: m.productId, status: m.status }, after: { productId: v.productId, note: v.note } } });
}

/** Makes a product translation public. For a translation created from a legacy record, the legacy URL now lands on it. */
export async function publishProductTranslation(db: PrismaClient, actor: Actor, productId: string, locale: Locale) {
  if (locale === "tr") throw new AdminError("Türkçe sürüm ürün durumuyla yayınlanır.");
  return db.$transaction(async (tx) => {
    const t = await tx.productTranslation.findUnique({ where: { productId_locale: { productId, locale } } });
    if (!t) throw new AdminError("Bu dil sürümü yok.");
    if (t.status === "APPROVED" || t.status === "LEGACY_SOURCE") throw new AdminError("Bu sürüm zaten yayında.");
    if (!t.title.trim() || !t.slug) throw new AdminError("Başlık ve adres olmadan yayınlanamaz.");
    const flipped = await tx.productTranslation.updateMany({ where: { id: t.id, status: t.status }, data: { status: "APPROVED" } });
    if (flipped.count !== 1) throw new AdminError("Bu sürüm aynı anda yayınlandı.");
    const path = localizePath(locale, `/urun/${t.slug}`);
    const shadow = await tx.redirect.findFirst({ where: { fromPath: { in: pathVariants(locale, `/urun/${t.slug}`) }, active: true } });
    if (shadow?.active) throw new AdminError(`“${path}” bir yönlendirmenin kaynağı; ürün adresini değiştirin.`);
    let redirect: { fromPath: string; from: string; to: string } | null = null;
    const m = t.legacyRecordId ? await tx.legacyMatchSuggestion.findFirst({ where: { productId, sourceLocale: locale, status: "APPROVED" } }) : null;
    if (m) {
      const rec = await tx.legacySourceRecord.findUnique({ where: { entityType_legacyId_locale: { entityType: "product", legacyId: m.sourceLegacyId, locale } } });
      const sourceUrl = (rec?.payload as { source_url?: string } | undefined)?.source_url;
      if (sourceUrl) {
        const fromPath = decodeURIComponent(new URL(sourceUrl).pathname);
        const r = await tx.redirect.findUnique({ where: { fromPath } });
        if (r && r.source === "LEGACY_AUDIT") {
          await tx.redirect.update({ where: { fromPath }, data: { toPath: path, note: `translation published ${new Date().toISOString().slice(0, 10)}` } });
          if (r.toPath !== path) await tx.legacyMatchSuggestion.update({ where: { id: m.id }, data: { previousRedirectTo: r.toPath } });
          redirect = { fromPath, from: r.toPath, to: path };
        }
      }
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: "translation.published", entityType: "Product", entityId: productId, after: { locale, slug: t.slug, redirect } } });
    return path;
  });
}

export async function unpublishProductTranslation(db: PrismaClient, actor: Actor, productId: string, locale: Locale) {
  if (locale === "tr") throw new AdminError("Türkçe sürüm ürün durumu ile yönetilir.");
  return db.$transaction(async (tx) => {
    const t = await tx.productTranslation.findUnique({ where: { productId_locale: { productId, locale } } });
    if (!t || (t.status !== "APPROVED" && t.status !== "LEGACY_SOURCE")) throw new AdminError("Bu sürüm yayında değil.");
    const flipped = await tx.productTranslation.updateMany({ where: { id: t.id, status: t.status }, data: { status: "IN_REVIEW" } });
    if (flipped.count !== 1) throw new AdminError("Bu sürüm aynı anda yayından kaldırıldı.");
    const m = await tx.legacyMatchSuggestion.findFirst({ where: { productId, sourceLocale: locale, status: "APPROVED" } });
    let restored: string | null = null;
    if (m?.previousRedirectTo) {
      const rec = await tx.legacySourceRecord.findUnique({ where: { entityType_legacyId_locale: { entityType: "product", legacyId: m.sourceLegacyId, locale } } });
      const sourceUrl = (rec?.payload as { source_url?: string } | undefined)?.source_url;
      if (sourceUrl) {
        const fromPath = decodeURIComponent(new URL(sourceUrl).pathname);
        await tx.redirect.updateMany({ where: { fromPath, source: "LEGACY_AUDIT" }, data: { toPath: m.previousRedirectTo } });
        restored = m.previousRedirectTo;
      }
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: "translation.unpublished", entityType: "Product", entityId: productId, after: { locale, redirectRestoredTo: restored } } });
  });
}

/** Per-language coverage (Admin › Çeviriler). */
export async function coverageReport(db: PrismaClient) {
  const LOCALES: Locale[] = ["tr", "en", "de", "fr", "ru", "ar"];
  const [products, categories, pages, menus, media, matches] = await Promise.all([
    db.product.findMany({ where: { status: "PUBLISHED", needsReview: false }, select: { translations: { select: { locale: true, status: true, seoTitle: true, seoDescription: true } } } }),
    db.category.findMany({ where: { status: "PUBLISHED" }, select: { translations: { select: { locale: true, status: true, seoTitle: true } } } }),
    db.pageTranslation.findMany({ where: { page: { status: { not: "ARCHIVED" } } }, select: { locale: true, state: true, bodyHtml: true, seoTitle: true, seoDescription: true } }),
    db.menuItem.findMany({ where: { active: true }, select: { labels: true } }),
    db.mediaTranslation.groupBy({ by: ["locale", "autoGenerated"], _count: true }),
    db.legacyMatchSuggestion.groupBy({ by: ["sourceLocale", "status"], _count: true }),
  ]);
  return LOCALES.map((locale) => {
    const pt = products.map((p) => p.translations.find((t) => t.locale === locale));
    const ct = categories.map((c) => c.translations.find((t) => t.locale === locale));
    const pg = pages.filter((p) => p.locale === locale);
    return {
      locale,
      products: { total: products.length, published: pt.filter((t) => t && (t.status === "APPROVED" || t.status === "LEGACY_SOURCE")).length, draft: pt.filter((t) => t && (t.status === "DRAFT" || t.status === "IN_REVIEW" || t.status === "MACHINE_DRAFT")).length, seo: pt.filter((t) => t?.seoTitle && t.seoDescription).length },
      categories: { total: categories.length, present: ct.filter(Boolean).length, seo: ct.filter((t) => t?.seoTitle).length },
      pages: { total: pg.length, published: pg.filter((p) => p.state === "PUBLISHED").length, review: pg.filter((p) => p.state === "REVIEW").length, draft: pg.filter((p) => p.state === "DRAFT").length, emptyBody: pg.filter((p) => !p.bodyHtml.trim()).length, seo: pg.filter((p) => p.seoTitle && p.seoDescription).length },
      menu: { total: menus.length, labelled: menus.filter((m) => (m.labels as Record<string, string>)[locale]).length },
      alt: { reviewed: media.find((x) => x.locale === locale && !x.autoGenerated)?._count ?? 0, auto: media.find((x) => x.locale === locale && x.autoGenerated)?._count ?? 0 },
      matches: Object.fromEntries(matches.filter((x) => x.sourceLocale === locale).map((x) => [x.status, x._count])) as Partial<Record<"SUGGESTED" | "APPROVED" | "REJECTED", number>>,
    };
  });
}
