import type { Locale, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { translationChecksum } from "@/lib/catalog/checksum";
import { sanitizeRichText } from "@/lib/catalog/sanitize";
import { localizePath, pathVariants } from "@/lib/i18n/routes";
import { AdminError } from "./action-state";
import { LOCALES } from "@/lib/i18n/config";

/**
 * Catalog editing (Sprint 6). Rules:
 *  - products are never hard-deleted: DRAFT / ARCHIVED only (quotes, prices, history keep pointing at them)
 *  - a product held for review (needsReview, e.g. legacy #208) is released ONLY with explicit permission + reason
 *  - slug changes keep every old URL working in ONE hop (new 301 + existing redirects re-pointed, loops refused)
 *  - editor changes are never overwritten by the importer (importChecksum mismatch → importer skips the row)
 *  - optimistic concurrency on Product.updatedAt
 */
export type Actor = { id: string; canReleaseHold?: boolean };
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugSchema = z.string().trim().toLowerCase().min(2, "Adres en az 2 karakter olmalı.").max(120).regex(SLUG_RE, "Yalnız küçük harf, rakam ve tire kullanın (örn. dairesel-kesim-hucresi).");
const PUBLIC_TRANSLATION = ["LEGACY_SOURCE", "APPROVED"];

/** Turkish-aware slug suggestion ("Döş Açma Testeresi" → "dos-acma-testeresi"). */
export function slugify(input: string): string {
  return input
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
type Tx = Prisma.TransactionClient;

async function lock(tx: Tx, id: string, expectedUpdatedAt: string) {
  const at = new Date(expectedUpdatedAt);
  if (Number.isNaN(at.getTime())) throw new AdminError("Form süresi doldu. Sayfayı yenileyin.");
  // bump updatedAt only if nobody saved since the editor opened the form
  const done = await tx.product.updateMany({ where: { id, updatedAt: at }, data: { updatedAt: new Date() } });
  if (done.count !== 1) throw new AdminError("Bu ürün siz düzenlerken başka biri tarafından kaydedildi. Sayfayı yenileyip değişikliklerinizi tekrar uygulayın.");
}

/**
 * Re-points URLs after a slug change, keeping every legacy/old URL at a single hop:
 *  - existing redirects that pointed at the old path now point at the new one
 *  - the old path itself gets a 301 to the new path
 *  - refuses if the new path is itself a redirect source (the page would be unreachable / loop)
 */
export async function moveProductUrl(tx: Tx, locale: Locale, oldSlug: string, newSlug: string) {
  const oldPath = localizePath(locale, `/urun/${oldSlug}`);
  const newPath = localizePath(locale, `/urun/${newSlug}`);
  if (oldPath === newPath) return null;
  const shadow = await tx.redirect.findFirst({ where: { fromPath: { in: pathVariants(locale, `/urun/${newSlug}`) }, active: true } });
  if (shadow?.active) throw new AdminError(`“${newPath}” adresi bir yönlendirmenin kaynağı (${shadow.source}); bu adres kullanılamaz.`, { slug: "Bu adres bir yönlendirmede kullanılıyor." });
  const repointed = await tx.redirect.updateMany({ where: { toPath: { in: pathVariants(locale, `/urun/${oldSlug}`) } }, data: { toPath: newPath } });
  await tx.redirect.upsert({
    where: { fromPath: oldPath },
    create: { fromPath: oldPath, toPath: newPath, statusCode: 301, source: "SLUG_CHANGE", note: `slug changed ${new Date().toISOString().slice(0, 10)}` },
    update: { toPath: newPath, statusCode: 301, active: true, note: `slug changed ${new Date().toISOString().slice(0, 10)}` },
  });
  return { oldPath, newPath, repointed: repointed.count };
}

export const translationSchema = z.object({
  id: z.string().min(10).max(40),
  expectedUpdatedAt: z.string().min(10),
  locale: z.enum(LOCALES),
  title: z.string().trim().min(2, "Ürün adı en az 2 karakter olmalı.").max(200),
  slug: slugSchema,
  shortDescription: z.string().trim().max(500).optional(),
  descriptionHtml: z.string().max(60_000).optional(),
  seoTitle: z.string().trim().max(120).optional(),
  seoDescription: z.string().trim().max(320).optional(),
});

/** Saves one language of a product (title, URL, texts, SEO). Live immediately if that language is published. */
export async function saveProductTranslation(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = translationSchema.parse(raw);
  const submitted = v.descriptionHtml ? sanitizeRichText(v.descriptionHtml) || null : null;
  return db.$transaction(async (tx) => {
    await lock(tx, v.id, v.expectedUpdatedAt);
    const before = await tx.productTranslation.findUnique({ where: { productId_locale: { productId: v.id, locale: v.locale } } });
    // the browser editor re-serializes HTML; an unchanged text (same canonical sanitized form) keeps the stored bytes
    const descriptionHtml = before && (sanitizeRichText(before.descriptionHtml ?? "") || null) === submitted ? before.descriptionHtml : submitted;
    const clash = await tx.productTranslation.findUnique({ where: { locale_slug: { locale: v.locale, slug: v.slug } }, select: { productId: true } });
    if (clash && clash.productId !== v.id) throw new AdminError("Bu adres başka bir üründe kullanılıyor.", { slug: "Adres benzersiz olmalı." });
    let moved = null;
    if (before && before.slug !== v.slug && PUBLIC_TRANSLATION.includes(before.status)) moved = await moveProductUrl(tx, v.locale, before.slug, v.slug);
    const data = { title: v.title.normalize("NFC"), slug: v.slug, shortDescription: v.shortDescription || null, descriptionHtml, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null };
    const contentChanged = !before || before.title !== data.title || before.slug !== data.slug || (before.descriptionHtml ?? null) !== descriptionHtml;
    const row = before
      ? await tx.productTranslation.update({
          where: { id: before.id },
          // an edited legacy text is no longer "verbatim legacy": APPROVED keeps it public; importChecksum is left as
          // the importer wrote it, so the next import sees the mismatch and skips this row (human edit wins)
          data: { ...data, status: before.status === "LEGACY_SOURCE" && contentChanged ? "APPROVED" : before.status },
        })
      : await tx.productTranslation.create({ data: { productId: v.id, locale: v.locale, ...data, status: v.locale === "tr" ? "APPROVED" : "DRAFT", importChecksum: null } });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: before ? "product.translation_updated" : "product.translation_created",
        entityType: "Product",
        entityId: v.id,
        before: before ? json({ locale: before.locale, title: before.title, slug: before.slug, seoTitle: before.seoTitle, seoDescription: before.seoDescription, descriptionLength: before.descriptionHtml?.length ?? 0, status: before.status }) : undefined,
        after: json({ locale: v.locale, title: row.title, slug: row.slug, seoTitle: row.seoTitle, seoDescription: row.seoDescription, descriptionLength: row.descriptionHtml?.length ?? 0, status: row.status, moved }),
      },
    });
    return { translation: row, moved };
  });
}

export const productMetaSchema = z.object({
  id: z.string().min(10).max(40),
  expectedUpdatedAt: z.string().min(10),
  sku: z
    .string()
    .trim()
    .max(64)
    .regex(/^[A-Za-z0-9._\-/]*$/, "SKU yalnız harf, rakam, nokta, tire, alt çizgi ve / içerebilir.")
    .optional(),
  sortOrder: z.coerce.number().int().min(-100000).max(100000),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  releaseHold: z.string().optional(),
  releaseReason: z.string().trim().max(500).optional(),
});

/** Status / SKU / ordering. Publishing a held product (#208) requires product.review_clear + a written reason. */
export async function saveProductMeta(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = productMetaSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await lock(tx, v.id, v.expectedUpdatedAt);
    const p = await tx.product.findUniqueOrThrow({ where: { id: v.id }, include: { translations: { select: { locale: true, status: true, title: true, slug: true } }, categories: true } });
    const release = v.releaseHold === "on";
    if (v.status === "PUBLISHED") {
      if (p.needsReview && !release) throw new AdminError("Bu ürün inceleme için bekletiliyor. Yayınlamak için “İncelemeyi tamamla” onayı ve gerekçe gerekir.", { releaseHold: "Onay gerekli" });
      const tr = p.translations.find((t) => t.locale === "tr");
      if (!tr || !PUBLIC_TRANSLATION.includes(tr.status)) throw new AdminError("Türkçe içerik olmadan ürün yayınlanamaz.");
      if (!p.categories.length) throw new AdminError("Yayınlamadan önce en az bir kategori seçin.");
    }
    if (release) {
      if (!actor.canReleaseHold) throw new AdminError("İncelemedeki ürünü serbest bırakma yetkiniz yok.");
      if ((v.releaseReason ?? "").length < 5) throw new AdminError("İncelemeyi tamamlama gerekçesini yazın.", { releaseReason: "Gerekçe zorunlu." });
    }
    const sku = v.sku || null;
    if (sku) {
      const clash = await tx.product.findUnique({ where: { sku }, select: { id: true } });
      if (clash && clash.id !== p.id) throw new AdminError("Bu SKU başka bir üründe kullanılıyor.", { sku: "SKU benzersiz olmalı." });
    }
    const updated = await tx.product.update({
      where: { id: p.id },
      data: {
        sku,
        sortOrder: v.sortOrder,
        status: v.status,
        archivedAt: v.status === "ARCHIVED" ? (p.archivedAt ?? new Date()) : null,
        ...(release ? { needsReview: false } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: release ? "product.hold_released" : "product.meta_updated",
        entityType: "Product",
        entityId: p.id,
        before: json({ sku: p.sku, sortOrder: p.sortOrder, status: p.status, needsReview: p.needsReview }),
        after: json({ sku: updated.sku, sortOrder: updated.sortOrder, status: updated.status, needsReview: updated.needsReview, releaseReason: release ? v.releaseReason : undefined }),
      },
    });
    return { product: updated, slugs: p.translations };
  });
}

export async function setProductCategories(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ id: z.string().min(10).max(40), expectedUpdatedAt: z.string().min(10), categoryIds: z.array(z.string().min(10).max(40)).max(20), primaryId: z.string().optional() }).parse(raw);
  return db.$transaction(async (tx) => {
    await lock(tx, v.id, v.expectedUpdatedAt);
    const cats = await tx.category.findMany({ where: { id: { in: v.categoryIds }, isAllProducts: false }, select: { id: true, key: true } });
    if (cats.length !== v.categoryIds.length) throw new AdminError("Geçersiz kategori seçimi (“Tüm Ürünler” sanal listedir, seçilemez).");
    const primaryId = v.primaryId && v.categoryIds.includes(v.primaryId) ? v.primaryId : v.categoryIds[0];
    const p = await tx.product.findUniqueOrThrow({ where: { id: v.id }, select: { status: true, categories: { select: { categoryId: true, isPrimary: true } } } });
    if (p.status === "PUBLISHED" && cats.length === 0) throw new AdminError("Yayındaki ürünün en az bir kategorisi olmalı.");
    await tx.productCategory.deleteMany({ where: { productId: v.id, categoryId: { notIn: v.categoryIds } } });
    for (const [i, c] of cats.entries()) {
      await tx.productCategory.upsert({ where: { productId_categoryId: { productId: v.id, categoryId: c.id } }, create: { productId: v.id, categoryId: c.id, isPrimary: c.id === primaryId, sortOrder: i }, update: { isPrimary: c.id === primaryId } });
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: "product.categories_updated", entityType: "Product", entityId: v.id, before: json(p.categories), after: json({ categories: cats.map((c) => c.key), primaryId }) } });
  });
}

export async function setRelatedProducts(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ id: z.string().min(10).max(40), relatedIds: z.array(z.string().min(10).max(40)).max(8, "En fazla 8 ilgili ürün seçin.") }).parse(raw);
  const ids = [...new Set(v.relatedIds)].filter((x) => x !== v.id);
  const found = await db.product.count({ where: { id: { in: ids } } });
  if (found !== ids.length) throw new AdminError("Geçersiz ürün seçimi.");
  await db.$transaction(async (tx) => {
    await tx.productRelation.deleteMany({ where: { fromId: v.id, kind: "related", toId: { notIn: ids } } });
    for (const toId of ids) await tx.productRelation.upsert({ where: { fromId_toId_kind: { fromId: v.id, toId, kind: "related" } }, create: { fromId: v.id, toId, kind: "related" }, update: {} });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "product.related_updated", entityType: "Product", entityId: v.id, after: { relatedIds: ids } } });
  });
}

const variantRow = z.object({ id: z.string().max(40).optional(), tr: z.string().trim().max(120), en: z.string().trim().max(120).optional(), de: z.string().trim().max(120).optional(), fr: z.string().trim().max(120).optional(), ru: z.string().trim().max(120).optional(), ar: z.string().trim().max(120).optional(), active: z.boolean(), sortOrder: z.coerce.number().int() });

/**
 * Options (variants). Existing variants are never deleted (quotes reference them) — only renamed / deactivated.
 * A product keeps "choice required" behaviour on the storefront while it has at least one active variant (#107).
 */
export async function saveVariants(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ productId: z.string().min(10).max(40), variants: z.array(variantRow).max(30) }).parse(raw);
  return db.$transaction(async (tx) => {
    const existing = await tx.productVariant.findMany({ where: { productId: v.productId } });
    const before = existing.map((x) => ({ id: x.id, labels: x.labels, active: x.active }));
    for (const row of v.variants) {
      const labels = Object.fromEntries((["tr", "en", "de", "fr", "ru", "ar"] as const).filter((l) => row[l]).map((l) => [l, row[l]!.normalize("NFC")]));
      if (row.id) {
        const ex = existing.find((x) => x.id === row.id);
        if (!ex) throw new AdminError("Seçenek bu ürüne ait değil.");
        if (!row.tr) throw new AdminError("Mevcut seçeneğin Türkçe adı boş bırakılamaz; kullanılmıyorsa pasif yapın.");
        await tx.productVariant.update({ where: { id: ex.id }, data: { labels, active: row.active, sortOrder: row.sortOrder } });
      } else if (row.tr) {
        await tx.productVariant.create({ data: { productId: v.productId, labels, active: row.active, sortOrder: row.sortOrder } });
      }
    }
    const after = await tx.productVariant.findMany({ where: { productId: v.productId }, select: { id: true, labels: true, active: true } });
    await tx.product.update({ where: { id: v.productId }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "product.variants_updated", entityType: "Product", entityId: v.productId, before: json(before), after: json(after) } });
  });
}

// ── technical specs ──

export const specSchema = z.object({
  productId: z.string().min(10).max(40),
  specId: z.string().max(40).optional(),
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,40}$/, "Anahtar: küçük harf, rakam ve alt çizgi (örn. motor_gucu)."),
  label: z.string().trim().min(2).max(80),
  value: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(20).optional(),
  sortOrder: z.coerce.number().int().default(0),
});

/** Any edit of a spec makes it UNVERIFIED again (only verified specs are shown on the storefront). */
export async function saveSpec(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = specSchema.parse(raw);
  const data = { key: v.key, labels: { tr: v.label }, values: { tr: v.value }, unit: v.unit || null, sortOrder: v.sortOrder, status: "UNVERIFIED" as const, source: null, verifiedAt: null };
  const spec = v.specId
    ? await db.productSpec.update({ where: { id: v.specId, productId: v.productId }, data })
    : await db.productSpec.create({ data: { productId: v.productId, ...data } });
  await db.auditLog.create({ data: { actorId: actor.id, action: v.specId ? "product.spec_updated" : "product.spec_created", entityType: "Product", entityId: v.productId, after: json({ specId: spec.id, key: v.key, label: v.label, value: v.value, unit: v.unit }) } });
  return spec;
}

export async function verifySpec(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ specId: z.string().min(10).max(40), source: z.string().trim().min(5, "Doğrulama kaynağını yazın (teknik föy adı/tarihi).").max(300) }).parse(raw);
  const spec = await db.productSpec.update({ where: { id: v.specId }, data: { status: "VERIFIED", source: v.source, verifiedAt: new Date() } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "product.spec_verified", entityType: "Product", entityId: spec.productId, after: { specId: spec.id, source: v.source } } });
  return spec;
}

/** Unverified specs are editor drafts and may be removed; verified ones must be un-verified (edited) first. */
export async function deleteSpec(db: PrismaClient, actor: Actor, specId: string) {
  const spec = await db.productSpec.findUnique({ where: { id: specId } });
  if (!spec) throw new AdminError("Özellik bulunamadı.");
  if (spec.status === "VERIFIED") throw new AdminError("Doğrulanmış özellik silinemez.");
  await db.productSpec.delete({ where: { id: specId } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "product.spec_deleted", entityType: "Product", entityId: spec.productId, before: json({ key: spec.key, labels: spec.labels, values: spec.values }) } });
}

// ── create / bulk ──

export async function createProduct(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ title: z.string().trim().min(2).max(200), slug: slugSchema, categoryId: z.string().min(10).max(40) }).parse(raw);
  const cat = await db.category.findUnique({ where: { id: v.categoryId }, select: { isAllProducts: true } });
  if (!cat || cat.isAllProducts) throw new AdminError("Geçerli bir kategori seçin.", { categoryId: "Kategori seçin." });
  const clash = await db.productTranslation.findUnique({ where: { locale_slug: { locale: "tr", slug: v.slug } } });
  if (clash) throw new AdminError("Bu adres başka bir üründe kullanılıyor.", { slug: "Adres benzersiz olmalı." });
  const redirect = await db.redirect.findUnique({ where: { fromPath: `/urun/${v.slug}` } });
  if (redirect?.active) throw new AdminError("Bu adres eski bir URL yönlendirmesinin kaynağı; başka adres seçin.", { slug: "Yönlendirme kaynağı." });
  return db.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        status: "DRAFT",
        verificationStatus: "UNVERIFIED",
        saleMode: "QUOTE_ONLY",
        sortOrder: 1000,
        translations: { create: { locale: "tr", title: v.title.normalize("NFC"), slug: v.slug, status: "APPROVED", importChecksum: translationChecksum({ title: v.title, slug: v.slug, descriptionHtml: null }) } },
        categories: { create: { categoryId: v.categoryId, isPrimary: true } },
        inventory: { create: { availability: "UNKNOWN" } },
      },
    });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "product.created", entityType: "Product", entityId: p.id, after: { title: v.title, slug: v.slug, status: "DRAFT" } } });
    return p;
  });
}

/** Bulk operations are deliberately limited to taking products OFF the storefront (draft / archive). */
export async function bulkProducts(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ ids: z.array(z.string().min(10).max(40)).min(1, "Ürün seçin.").max(100), op: z.enum(["draft", "archive"]) }).parse(raw);
  const status = v.op === "draft" ? "DRAFT" : "ARCHIVED";
  return db.$transaction(async (tx) => {
    const before = await tx.product.findMany({ where: { id: { in: v.ids } }, select: { id: true, status: true } });
    await tx.product.updateMany({ where: { id: { in: v.ids } }, data: { status, archivedAt: status === "ARCHIVED" ? new Date() : null } });
    for (const b of before) await tx.auditLog.create({ data: { actorId: actor.id, action: `product.bulk_${v.op}`, entityType: "Product", entityId: b.id, before: { status: b.status }, after: { status } } });
    return before.length;
  });
}

// ── categories ──

export const categorySchema = z.object({
  id: z.string().min(10).max(40),
  locale: z.enum(LOCALES),
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  description: z.string().trim().max(2000).optional(),
  seoTitle: z.string().trim().max(120).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).optional(),
});

/** Category text per language. A slug change gets a 301 from the old category path (and its paginated pages). */
export async function saveCategoryTranslation(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = categorySchema.parse(raw);
  return db.$transaction(async (tx) => {
    const before = await tx.categoryTranslation.findUnique({ where: { categoryId_locale: { categoryId: v.id, locale: v.locale } } });
    const clash = await tx.categoryTranslation.findUnique({ where: { locale_slug: { locale: v.locale, slug: v.slug } } });
    if (clash && clash.categoryId !== v.id) throw new AdminError("Bu adres başka bir kategoride kullanılıyor.", { slug: "Adres benzersiz olmalı." });
    if (before && before.slug !== v.slug) {
      const oldPath = localizePath(v.locale, `/kategori/${before.slug}`);
      const newPath = localizePath(v.locale, `/kategori/${v.slug}`);
      const shadow = await tx.redirect.findUnique({ where: { fromPath: newPath } });
      if (shadow?.active) throw new AdminError("Yeni adres bir yönlendirmenin kaynağı; başka adres seçin.", { slug: "Yönlendirme kaynağı." });
      await tx.redirect.updateMany({ where: { toPath: oldPath }, data: { toPath: newPath } });
      await tx.redirect.upsert({ where: { fromPath: oldPath }, create: { fromPath: oldPath, toPath: newPath, source: "SLUG_CHANGE", note: "category slug changed" }, update: { toPath: newPath, active: true } });
    }
    const data = { name: v.name.normalize("NFC"), slug: v.slug, description: v.description || null, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null };
    const row = before
      ? await tx.categoryTranslation.update({ where: { id: before.id }, data: { ...data, status: before.status === "MISSING" ? "DRAFT" : before.status } })
      : await tx.categoryTranslation.create({ data: { categoryId: v.id, locale: v.locale, ...data, status: "DRAFT" } });
    if (v.sortOrder !== undefined) await tx.category.update({ where: { id: v.id }, data: { sortOrder: v.sortOrder } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "category.translation_saved", entityType: "Category", entityId: v.id, before: before ? json({ locale: before.locale, name: before.name, slug: before.slug }) : undefined, after: json({ locale: v.locale, name: row.name, slug: row.slug }) } });
    return row;
  });
}
