import type { PrismaClient } from "@prisma/client";
import { AdminError } from "./action-state";

/**
 * One-click list actions (client request 30.10.2026: "Düzenle – Pasif yap – Sil" next to every row).
 *  - "Pasif yap" = take off the storefront (product/category → DRAFT); reversible with "Aktif yap".
 *  - "Sil" is a real delete only where nothing can break: never for products/categories that came from the old site
 *    (their URLs carry 301 redirects and Google history) or that appear in orders/quotes — those are ARCHIVED instead
 *    (hidden everywhere, history and redirects kept). The result message always says which of the two happened.
 */
type Actor = { id: string };

async function audit(db: PrismaClient, actorId: string, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) {
  await db.auditLog.create({ data: { actorId, action, entityType, entityId, before: before as object | undefined, after: after as object | undefined } });
}

export async function setProductActive(db: PrismaClient, actor: Actor, id: string, active: boolean) {
  const p = await db.product.findUnique({ where: { id }, select: { id: true, status: true, needsReview: true } });
  if (!p) throw new AdminError("Ürün bulunamadı.");
  if (active && p.needsReview) throw new AdminError("Bu ürün incelemede. Önce ürün sayfasında “İncelemeyi tamamla” işaretleyin.");
  const status = active ? "PUBLISHED" : "DRAFT";
  await db.product.update({ where: { id }, data: { status, archivedAt: null } });
  await audit(db, actor.id, active ? "product.activated" : "product.deactivated", "Product", id, { status: p.status }, { status });
}

export async function deleteProduct(db: PrismaClient, actor: Actor, id: string): Promise<"deleted" | "archived"> {
  const p = await db.product.findUnique({ where: { id }, select: { id: true, status: true, sourceKey: true, _count: { select: { orderItems: true, quoteItems: true } } } });
  if (!p) throw new AdminError("Ürün bulunamadı.");
  const keep = !!p.sourceKey || p._count.orderItems > 0 || p._count.quoteItems > 0;
  if (keep) {
    await db.product.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
    await audit(db, actor.id, "product.archived", "Product", id, { status: p.status }, { status: "ARCHIVED", reason: p.sourceKey ? "legacy product (redirects kept)" : "has orders/quotes" });
    return "archived";
  }
  await db.$transaction(async (tx) => {
    await tx.product.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "product.deleted", entityType: "Product", entityId: id, before: { status: p.status } } });
  });
  return "deleted";
}

export async function setCategoryActive(db: PrismaClient, actor: Actor, id: string, active: boolean) {
  const c = await db.category.findUnique({ where: { id }, select: { id: true, status: true, isAllProducts: true } });
  if (!c) throw new AdminError("Kategori bulunamadı.");
  if (c.isAllProducts && !active) throw new AdminError("“Tüm Ürünler” listesi pasif yapılamaz.");
  const status = active ? "PUBLISHED" : "DRAFT";
  await db.category.update({ where: { id }, data: { status } });
  await audit(db, actor.id, active ? "category.activated" : "category.deactivated", "Category", id, { status: c.status }, { status });
}

export async function deleteCategory(db: PrismaClient, actor: Actor, id: string): Promise<"deleted" | "archived"> {
  const c = await db.category.findUnique({ where: { id }, select: { id: true, status: true, isAllProducts: true, _count: { select: { products: true } } } });
  if (!c) throw new AdminError("Kategori bulunamadı.");
  if (c.isAllProducts) throw new AdminError("“Tüm Ürünler” listesi silinemez.");
  if (c._count.products > 0) throw new AdminError(`Bu kategoride ${c._count.products} ürün var. Önce ürünleri başka kategoriye taşıyın ya da kategoriyi pasif yapın.`);
  // categories imported from the old site keep their URLs (301 targets) → archive instead of delete
  const legacy = await db.categoryTranslation.count({ where: { categoryId: id, status: "LEGACY_SOURCE" } });
  if (legacy) {
    await db.category.update({ where: { id }, data: { status: "ARCHIVED" } });
    await audit(db, actor.id, "category.archived", "Category", id, { status: c.status }, { status: "ARCHIVED", reason: "legacy category (redirects kept)" });
    return "archived";
  }
  await db.$transaction(async (tx) => {
    await tx.category.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "category.deleted", entityType: "Category", entityId: id } });
  });
  return "deleted";
}
