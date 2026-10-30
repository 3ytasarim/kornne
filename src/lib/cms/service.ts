import type { ContentState, Locale, PageKind, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AdminError } from "@/lib/admin/action-state";
import { slugSchema } from "@/lib/admin/products";
import { sanitizeRichText } from "@/lib/catalog/sanitize";
import { localizePath } from "@/lib/i18n/routes";
import { isSettingKey, SETTING_DEFS, settingProblem, type SettingKey } from "./settings";

/**
 * CMS writes (Sprint 7, docs/cms/content-management-guide.md).
 * Pages: every save writes an immutable PageRevision; the storefront serves only the PUBLISHED revision, so a live
 * page never changes until a publisher publishes again. Workflow DRAFT → REVIEW → PUBLISHED (→ DRAFT / ARCHIVED).
 * Rich text is sanitized on the server (allow-list) — what the editor sends is never trusted.
 */
export type Actor = { id: string; canPublish: boolean };
const LOCALES = ["tr", "en", "fr", "ru", "ar"] as const;
type Tx = Prisma.TransactionClient;
const pagePath = (kind: PageKind, locale: Locale, slug: string) => localizePath(locale, kind === "BLOG" ? `/blog/${slug}` : `/sayfa/${slug}`);

async function auditLog(tx: Tx | PrismaClient, actorId: string, action: string, entityType: string, entityId: string, after?: object, before?: object) {
  await tx.auditLog.create({ data: { actorId, action, entityType, entityId, after: after as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue } });
}

export const pageCreateSchema = z.object({
  kind: z.enum(["CORPORATE", "LEGAL", "INFO", "BLOG"]),
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, "Anahtar: küçük harf, rakam, tire (örn. hakkimizda)."),
  locale: z.enum(LOCALES).default("tr"),
  title: z.string().trim().min(2).max(200),
  slug: slugSchema,
});

export async function createPage(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = pageCreateSchema.parse(raw);
  if (await db.page.findUnique({ where: { key: v.key } })) throw new AdminError("Bu anahtarla bir içerik zaten var.", { key: "Kullanımda" });
  if (await db.pageTranslation.findUnique({ where: { locale_slug: { locale: v.locale, slug: v.slug } } })) throw new AdminError("Bu adres kullanılıyor.", { slug: "Kullanımda" });
  return db.$transaction(async (tx) => {
    const page = await tx.page.create({ data: { kind: v.kind, key: v.key, status: "DRAFT" } });
    const t = await tx.pageTranslation.create({ data: { pageId: page.id, locale: v.locale, title: v.title, slug: v.slug, bodyHtml: "", state: "DRAFT", authorId: actor.id, updatedById: actor.id } });
    await tx.pageRevision.create({ data: { pageTranslationId: t.id, title: v.title, slug: v.slug, bodyHtml: "", authorId: actor.id, note: "oluşturuldu" } });
    await auditLog(tx, actor.id, "content.page_created", "Page", page.id, { key: v.key, kind: v.kind, locale: v.locale });
    return { page, translation: t };
  });
}

export const pageDraftSchema = z.object({
  pageId: z.string().min(10).max(40),
  locale: z.enum(LOCALES),
  expectedUpdatedAt: z.string().optional(),
  title: z.string().trim().min(2, "Başlık en az 2 karakter.").max(200),
  slug: slugSchema,
  excerpt: z.string().trim().max(400).optional(),
  bodyHtml: z.string().max(200_000),
  seoTitle: z.string().trim().max(120).optional(),
  seoDescription: z.string().trim().max(320).optional(),
  note: z.string().trim().max(200).optional(),
});

/** Saves the working copy (+ a revision). Creates the language version if it does not exist yet (as DRAFT). */
export async function savePageDraft(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = pageDraftSchema.parse(raw);
  const bodyHtml = sanitizeRichText(v.bodyHtml);
  return db.$transaction(async (tx) => {
    const page = await tx.page.findUnique({ where: { id: v.pageId } });
    if (!page) throw new AdminError("İçerik bulunamadı.");
    if (page.status === "ARCHIVED") throw new AdminError("Arşivdeki içerik düzenlenemez; önce arşivden çıkarın.");
    const clash = await tx.pageTranslation.findUnique({ where: { locale_slug: { locale: v.locale, slug: v.slug } } });
    const existing = await tx.pageTranslation.findUnique({ where: { pageId_locale: { pageId: page.id, locale: v.locale } } });
    if (clash && clash.id !== existing?.id) throw new AdminError("Bu adres bu dilde başka bir içerikte kullanılıyor.", { slug: "Kullanımda" });
    if (existing && v.expectedUpdatedAt && +existing.updatedAt !== +new Date(v.expectedUpdatedAt)) throw new AdminError("Bu içerik siz düzenlerken başka biri tarafından kaydedildi. Sayfayı yenileyin (son sürüm geçmişte duruyor).");
    const data = { title: v.title.normalize("NFC"), slug: v.slug, excerpt: v.excerpt || null, bodyHtml, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null, updatedById: actor.id };
    // a non-publisher editing a page that is in review keeps it in review; a published page stays live (old revision)
    const t = existing
      ? await tx.pageTranslation.update({ where: { id: existing.id }, data })
      : await tx.pageTranslation.create({ data: { pageId: page.id, locale: v.locale, ...data, state: "DRAFT", authorId: actor.id } });
    const rev = await tx.pageRevision.create({ data: { pageTranslationId: t.id, title: data.title, slug: data.slug, excerpt: data.excerpt, bodyHtml, seoTitle: data.seoTitle, seoDescription: data.seoDescription, authorId: actor.id, note: v.note || null } });
    await auditLog(tx, actor.id, "content.page_saved", "Page", page.id, { locale: v.locale, revisionId: rev.id, bodyLength: bodyHtml.length, sanitizedChanged: bodyHtml !== v.bodyHtml.trim() });
    return { translation: t, revision: rev, sanitized: bodyHtml !== v.bodyHtml.trim() };
  });
}

async function translationOf(tx: Tx, pageId: string, locale: Locale) {
  const t = await tx.pageTranslation.findUnique({ where: { pageId_locale: { pageId, locale } }, include: { page: true } });
  if (!t) throw new AdminError("Bu dil sürümü yok.");
  return t;
}

export async function submitForReview(db: PrismaClient, actor: Actor, pageId: string, locale: Locale) {
  return db.$transaction(async (tx) => {
    const t = await translationOf(tx, pageId, locale);
    if (t.state === "PUBLISHED" && !(await hasUnpublishedChanges(tx, t.id))) throw new AdminError("Yayındaki sürümde değişiklik yok.");
    await tx.pageTranslation.update({ where: { id: t.id }, data: { state: t.state === "PUBLISHED" ? "PUBLISHED" : "REVIEW" } });
    await auditLog(tx, actor.id, "content.review_requested", "Page", pageId, { locale });
  });
}

async function hasUnpublishedChanges(tx: Tx, translationId: string) {
  const t = await tx.pageTranslation.findUniqueOrThrow({ where: { id: translationId }, select: { publishedRevisionId: true } });
  const latest = await tx.pageRevision.findFirst({ where: { pageTranslationId: translationId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return !!latest && latest.id !== t.publishedRevisionId;
}

/** Publishes the LATEST revision. A changed public URL keeps working via a 301 from the previous published slug. */
export async function publishPage(db: PrismaClient, actor: Actor, pageId: string, locale: Locale) {
  if (!actor.canPublish) throw new AdminError("Yayınlama yetkiniz yok; içeriği incelemeye gönderin.");
  return db.$transaction(async (tx) => {
    const t = await translationOf(tx, pageId, locale);
    if (t.page.status === "ARCHIVED") throw new AdminError("Arşivdeki içerik yayınlanamaz.");
    const rev = await tx.pageRevision.findFirst({ where: { pageTranslationId: t.id }, orderBy: { createdAt: "desc" } });
    if (!rev) throw new AdminError("Yayınlanacak sürüm yok.");
    if (locale === "tr" && !rev.bodyHtml.trim()) throw new AdminError("Türkçe sürümün metni boş; boş sayfa yayınlanamaz.");
    const clash = await tx.pageTranslation.findFirst({ where: { locale, publishedSlug: rev.slug, id: { not: t.id } } });
    if (clash) throw new AdminError("Bu adres bu dilde yayında olan başka bir içerikte kullanılıyor.");
    const newPath = pagePath(t.page.kind, locale, rev.slug);
    const shadow = await tx.redirect.findUnique({ where: { fromPath: newPath } });
    if (shadow?.active) throw new AdminError(`“${newPath}” bir yönlendirmenin kaynağı; başka adres seçin.`);
    if (t.publishedSlug && t.publishedSlug !== rev.slug) {
      const oldPath = pagePath(t.page.kind, locale, t.publishedSlug);
      await tx.redirect.updateMany({ where: { toPath: oldPath }, data: { toPath: newPath } });
      await tx.redirect.upsert({ where: { fromPath: oldPath }, create: { fromPath: oldPath, toPath: newPath, source: "SLUG_CHANGE", note: "content slug changed" }, update: { toPath: newPath, active: true } });
    }
    await tx.pageTranslation.update({ where: { id: t.id }, data: { state: "PUBLISHED", publishedRevisionId: rev.id, publishedSlug: rev.slug, publishedAt: new Date(), status: "APPROVED" } });
    if (t.page.status !== "PUBLISHED") await tx.page.update({ where: { id: pageId }, data: { status: "PUBLISHED" } });
    await auditLog(tx, actor.id, "content.page_published", "Page", pageId, { locale, revisionId: rev.id, path: newPath });
    return newPath;
  });
}

/** Takes a language version off the storefront (back to DRAFT). Its URL then answers 404 — no fake redirect. */
export async function unpublishPage(db: PrismaClient, actor: Actor, pageId: string, locale: Locale) {
  if (!actor.canPublish) throw new AdminError("Yayından kaldırma yetkiniz yok.");
  return db.$transaction(async (tx) => {
    const t = await translationOf(tx, pageId, locale);
    if (t.state !== "PUBLISHED") throw new AdminError("Bu sürüm yayında değil.");
    await tx.pageTranslation.update({ where: { id: t.id }, data: { state: "DRAFT", publishedRevisionId: null, publishedSlug: null, publishedAt: null } });
    const still = await tx.pageTranslation.count({ where: { pageId, state: "PUBLISHED" } });
    if (!still) await tx.page.update({ where: { id: pageId }, data: { status: "DRAFT" } });
    await auditLog(tx, actor.id, "content.page_unpublished", "Page", pageId, { locale });
  });
}

/** Copies an old revision into the working copy (as a new revision). Publishing it is a separate step. */
export async function restoreRevision(db: PrismaClient, actor: Actor, revisionId: string) {
  return db.$transaction(async (tx) => {
    const rev = await tx.pageRevision.findUnique({ where: { id: revisionId }, include: { translation: true } });
    if (!rev) throw new AdminError("Sürüm bulunamadı.");
    const clash = await tx.pageTranslation.findUnique({ where: { locale_slug: { locale: rev.translation.locale, slug: rev.slug } } });
    if (clash && clash.id !== rev.pageTranslationId) throw new AdminError("Bu sürümün adresi artık başka bir içerikte kullanılıyor.");
    await tx.pageTranslation.update({ where: { id: rev.pageTranslationId }, data: { title: rev.title, slug: rev.slug, excerpt: rev.excerpt, bodyHtml: rev.bodyHtml, seoTitle: rev.seoTitle, seoDescription: rev.seoDescription, updatedById: actor.id } });
    const copy = await tx.pageRevision.create({ data: { pageTranslationId: rev.pageTranslationId, title: rev.title, slug: rev.slug, excerpt: rev.excerpt, bodyHtml: rev.bodyHtml, seoTitle: rev.seoTitle, seoDescription: rev.seoDescription, authorId: actor.id, note: `geri yüklendi: ${rev.createdAt.toISOString().slice(0, 16).replace("T", " ")}` } });
    await auditLog(tx, actor.id, "content.revision_restored", "Page", rev.translation.pageId, { locale: rev.translation.locale, fromRevisionId: rev.id, newRevisionId: copy.id });
    return rev.translation.pageId;
  });
}

export async function setPageArchived(db: PrismaClient, actor: Actor, pageId: string, archived: boolean) {
  if (!actor.canPublish) throw new AdminError("Arşivleme yetkiniz yok.");
  return db.$transaction(async (tx) => {
    const page = await tx.page.findUnique({ where: { id: pageId } });
    if (!page) throw new AdminError("İçerik bulunamadı.");
    if (archived) {
      await tx.pageTranslation.updateMany({ where: { pageId }, data: { state: "ARCHIVED", publishedRevisionId: null, publishedSlug: null, publishedAt: null } });
      await tx.page.update({ where: { id: pageId }, data: { status: "ARCHIVED" } });
    } else {
      await tx.pageTranslation.updateMany({ where: { pageId }, data: { state: "DRAFT" } });
      await tx.page.update({ where: { id: pageId }, data: { status: "DRAFT" } });
    }
    await auditLog(tx, actor.id, archived ? "content.page_archived" : "content.page_unarchived", "Page", pageId);
  });
}

/** Records the client's / lawyer's approval of a legal text (super admin, with a written reference). */
export async function setLegalApproval(db: PrismaClient, actor: { id: string }, pageId: string, reference: string | null) {
  if (reference !== null && reference.trim().length < 5) throw new AdminError("Onay referansını yazın (kim, ne zaman, hangi yazışma).");
  await db.page.update({ where: { id: pageId }, data: { legalApprovedAt: reference ? new Date() : null } });
  await auditLog(db, actor.id, reference ? "content.legal_approved" : "content.legal_approval_removed", "Page", pageId, reference ? { reference: reference.trim() } : undefined);
}

// ── FAQ / Q&A ──

const stateFor = (actor: Actor, requested: ContentState): ContentState => (actor.canPublish ? requested : requested === "PUBLISHED" ? "REVIEW" : requested);

export const faqSchema = z.object({
  id: z.string().max(40).optional(),
  locale: z.enum(LOCALES),
  question: z.string().trim().min(5, "Soru en az 5 karakter.").max(300),
  answerHtml: z.string().max(20_000),
  productId: z.string().max(40).optional(),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
  state: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]),
  source: z.string().trim().max(300).optional(),
});

/** An answer can only be published with a stated source (no invented expertise — GEO rule). */
export async function saveFaq(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = faqSchema.parse(raw);
  const answerHtml = sanitizeRichText(v.answerHtml);
  if (!answerHtml) throw new AdminError("Cevap boş olamaz.", { answerHtml: "Cevap yazın." });
  const state = stateFor(actor, v.state);
  if (state === "PUBLISHED" && (v.source ?? "").length < 5) throw new AdminError("Yayınlanacak cevabın kaynağını yazın (teknik föy, firma beyanı…).", { source: "Kaynak zorunlu" });
  if (v.productId && !(await db.product.findUnique({ where: { id: v.productId }, select: { id: true } }))) throw new AdminError("Ürün bulunamadı.");
  const data = { locale: v.locale, question: v.question, answerHtml, productId: v.productId || null, sortOrder: v.sortOrder, state, source: v.source || null, updatedById: actor.id };
  const row = v.id ? await db.faqItem.update({ where: { id: v.id }, data }) : await db.faqItem.create({ data });
  await auditLog(db, actor.id, v.id ? "content.faq_updated" : "content.faq_created", "FaqItem", row.id, { locale: v.locale, state, productId: row.productId });
  return row;
}

// ── banners ──

export const bannerSchema = z.object({
  id: z.string().max(40).optional(),
  placement: z.enum(["HOME_STRIP", "TOPBAR"]),
  state: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"]),
  startsAt: z.string().trim().optional(),
  endsAt: z.string().trim().optional(),
  linkPath: z.string().trim().max(300).optional(),
  sortOrder: z.coerce.number().int().min(-100).max(100).default(0),
  translations: z.array(z.object({ locale: z.enum(LOCALES), title: z.string().trim().max(140), text: z.string().trim().max(300).optional(), ctaLabel: z.string().trim().max(40).optional() })),
});

export function linkProblem(link: string): string | null {
  if (!link) return null;
  if (/^https:\/\/[^\s]+$/.test(link)) return null;
  if (/^\/(?!\/)[^\s<>"']*$/.test(link)) return null;
  return "Site içi adres (/ ile başlayan) veya https:// adresi girin.";
}

/** Published banners need an END date: an old campaign can never stay live forever. */
export async function saveBanner(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = bannerSchema.parse(raw);
  const startsAt = v.startsAt ? new Date(v.startsAt) : null;
  const endsAt = v.endsAt ? new Date(v.endsAt) : null;
  if ((startsAt && Number.isNaN(+startsAt)) || (endsAt && Number.isNaN(+endsAt))) throw new AdminError("Geçerli tarih girin.");
  if (startsAt && endsAt && endsAt <= startsAt) throw new AdminError("Bitiş, başlangıçtan sonra olmalı.", { endsAt: "Tarih aralığı hatalı" });
  const state = stateFor(actor, v.state);
  if (state === "PUBLISHED" && !endsAt) throw new AdminError("Yayındaki duyurunun bitiş tarihi olmalı.", { endsAt: "Bitiş tarihi zorunlu" });
  const lp = linkProblem(v.linkPath ?? "");
  if (lp) throw new AdminError(lp, { linkPath: lp });
  const tr = v.translations.find((t) => t.locale === "tr");
  if (!tr?.title) throw new AdminError("Türkçe başlık zorunlu.", { "translations.tr.title": "Zorunlu" });
  return db.$transaction(async (tx) => {
    const data = { placement: v.placement, state, startsAt, endsAt, linkPath: v.linkPath || null, sortOrder: v.sortOrder, updatedById: actor.id };
    const b = v.id ? await tx.banner.update({ where: { id: v.id }, data }) : await tx.banner.create({ data });
    for (const t of v.translations) {
      if (!t.title) {
        await tx.bannerTranslation.deleteMany({ where: { bannerId: b.id, locale: t.locale } });
        continue;
      }
      await tx.bannerTranslation.upsert({ where: { bannerId_locale: { bannerId: b.id, locale: t.locale } }, create: { bannerId: b.id, locale: t.locale, title: t.title, text: t.text || null, ctaLabel: t.ctaLabel || null }, update: { title: t.title, text: t.text || null, ctaLabel: t.ctaLabel || null } });
    }
    await auditLog(tx, actor.id, v.id ? "content.banner_updated" : "content.banner_created", "Banner", b.id, { state, startsAt, endsAt, placement: v.placement });
    return b;
  });
}

// ── menus ──

export const menuSchema = z.object({
  id: z.string().max(40).optional(),
  location: z.enum(["HEADER", "FOOTER_CORPORATE", "FOOTER_LEGAL"]),
  kind: z.enum(["page", "category", "path"]),
  pageKey: z.string().trim().max(60).optional(),
  categoryKey: z.string().trim().max(60).optional(),
  path: z.string().trim().max(300).optional(),
  labels: z.record(z.enum(LOCALES), z.string().trim().max(60)),
  sortOrder: z.coerce.number().int().min(-100).max(100).default(0),
  active: z.boolean(),
});

export async function saveMenuItem(db: PrismaClient, actor: { id: string }, raw: unknown) {
  const v = menuSchema.parse(raw);
  const labels = Object.fromEntries(Object.entries(v.labels).filter(([, s]) => s));
  if (!labels.tr) throw new AdminError("Türkçe etiket zorunlu.", { "labels.tr": "Zorunlu" });
  if (v.kind === "page" && !(v.pageKey && (await db.page.findUnique({ where: { key: v.pageKey } })))) throw new AdminError("Sayfa bulunamadı.", { pageKey: "Geçersiz" });
  if (v.kind === "category" && !(v.categoryKey && (await db.category.findUnique({ where: { key: v.categoryKey } })))) throw new AdminError("Kategori bulunamadı.", { categoryKey: "Geçersiz" });
  if (v.kind === "path") {
    const p = linkProblem(v.path ?? "");
    if (!v.path || p) throw new AdminError(p ?? "Adres girin.", { path: p ?? "Zorunlu" });
  }
  const data = { location: v.location, kind: v.kind, pageKey: v.kind === "page" ? v.pageKey! : null, categoryKey: v.kind === "category" ? v.categoryKey! : null, path: v.kind === "path" ? v.path! : null, labels, sortOrder: v.sortOrder, active: v.active, updatedById: actor.id };
  const row = v.id ? await db.menuItem.update({ where: { id: v.id }, data }) : await db.menuItem.create({ data });
  await auditLog(db, actor.id, v.id ? "content.menu_updated" : "content.menu_created", "MenuItem", row.id, { location: v.location, kind: v.kind, labels });
  return row;
}

/** Menu entries are configuration (no customer data, no history value) — removing one is allowed and audited. */
export async function deleteMenuItem(db: PrismaClient, actor: { id: string }, id: string) {
  const row = await db.menuItem.findUnique({ where: { id } });
  if (!row) throw new AdminError("Menü öğesi bulunamadı.");
  await db.menuItem.delete({ where: { id } });
  await auditLog(db, actor.id, "content.menu_deleted", "MenuItem", id, undefined, { location: row.location, labels: row.labels as object, kind: row.kind });
}

// ── settings ──

/** Any edit makes the value UNVERIFIED again; verifying needs settings.verify (super admin) and a source. */
export async function saveSetting(db: PrismaClient, actor: { id: string }, key: string, value: string, source?: string) {
  if (!isSettingKey(key)) throw new AdminError("Bilinmeyen ayar.");
  const problem = settingProblem(key, value.trim());
  if (problem) throw new AdminError(problem, { value: problem });
  const before = await db.siteSetting.findUnique({ where: { key } });
  const row = await db.siteSetting.upsert({ where: { key }, create: { key, value: value.trim(), status: "UNVERIFIED", source: source || null, updatedById: actor.id }, update: { value: value.trim(), status: "UNVERIFIED", source: source || before?.source || null, updatedById: actor.id } });
  const sensitive = SETTING_DEFS[key as SettingKey].publicWhen === "never";
  await auditLog(db, actor.id, "settings.updated", "SiteSetting", key, { value: sensitive ? "[gizli]" : row.value as string }, before ? { value: sensitive ? "[gizli]" : (before.value as string) } : undefined);
  return row;
}

export async function verifySetting(db: PrismaClient, actor: { id: string }, key: string, source: string, verified: boolean) {
  if (!isSettingKey(key)) throw new AdminError("Bilinmeyen ayar.");
  if (verified && source.trim().length < 5) throw new AdminError("Doğrulama kaynağını yazın (kim, ne zaman, hangi belge).", { source: "Kaynak zorunlu" });
  const row = await db.siteSetting.findUnique({ where: { key } });
  if (!row || !String(row.value ?? "").trim()) throw new AdminError("Boş değer doğrulanamaz.");
  await db.siteSetting.update({ where: { key }, data: { status: verified ? "VERIFIED" : "UNVERIFIED", source: verified ? source.trim() : row.source } });
  await auditLog(db, actor.id, verified ? "settings.verified" : "settings.unverified", "SiteSetting", key, { source: verified ? source.trim() : null });
}
