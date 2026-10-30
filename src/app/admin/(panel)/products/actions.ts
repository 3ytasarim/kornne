"use server";

import { redirect } from "next/navigation";
import type { Locale } from "@prisma/client";
import { requireAnyPermission, requirePermission } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { AdminError, type ActionState } from "@/lib/admin/action-state";
import { uploadDocument, uploadImage, saveMediaText, saveProductMedia } from "@/lib/admin/media";
import { bulkProducts, createProduct, deleteSpec, saveCategoryTranslation, saveProductMeta, saveProductTranslation, saveSpec, saveVariants, setProductCategories, setRelatedProducts, verifySpec } from "@/lib/admin/products";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { formObject, runAction } from "@/lib/admin/run-action";
import { requireDb } from "@/lib/db";

const str = (f: FormData, k: string) => (typeof f.get(k) === "string" ? (f.get(k) as string) : "");
const done = (msg: string, failed: string[]) => (failed.length ? { ok: `${msg} Uyarı: önbellek yenilenemedi (${failed.join(", ")}); değişiklik en geç 5 dk içinde görünür.` } : msg);

export async function saveTranslationAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = f.get("locale") === "tr" ? await requirePermission("product.edit") : await requireAnyPermission(["product.edit", "translation.publish"]);
    const r = await saveProductTranslation(requireDb(), user, formObject(f));
    const failed = revalidateStorefront("product");
    const msg = r.moved ? `Kaydedildi. Eski adres ${r.moved.oldPath} → ${r.moved.newPath} (301) yönlendirildi.` : "Kaydedildi.";
    return { ok: failed.length ? `${msg} Uyarı: önbellek yenilenemedi (${failed.join(", ")}).` : msg };
  });
}

export async function saveMetaAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const db = requireDb();
    const user = await requirePermission("product.edit");
    const id = str(f, "id");
    const current = await db.product.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new AdminError("Ürün bulunamadı.");
    const next = str(f, "status");
    if (next !== current.status) {
      if (next === "PUBLISHED") await requirePermission("product.publish");
      if (next === "ARCHIVED") await requirePermission("product.archive");
    }
    if (f.get("releaseHold") === "on") await requirePermission("product.review_clear");
    await saveProductMeta(db, { id: user.id, canReleaseHold: allowed(user.role, "product.review_clear") }, formObject(f));
    return done("Kaydedildi.", revalidateStorefront("product"));
  });
}

export async function saveCategoriesAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("product.edit");
    await setProductCategories(requireDb(), user, { id: str(f, "id"), expectedUpdatedAt: str(f, "expectedUpdatedAt"), categoryIds: f.getAll("categoryIds").map(String), primaryId: str(f, "primaryId") || undefined });
    return done("Kategoriler kaydedildi.", revalidateStorefront("product"));
  });
}

export async function saveRelatedAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("product.edit");
    await setRelatedProducts(requireDb(), user, { id: str(f, "id"), relatedIds: f.getAll("relatedIds").map(String) });
    return done("İlgili ürünler kaydedildi.", revalidateStorefront("product"));
  });
}

export async function saveVariantsAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("product.edit");
    const rows = f.getAll("vrow").map(String);
    const variants = rows.map((k) => ({
      id: str(f, `v.${k}.id`) || undefined,
      tr: str(f, `v.${k}.tr`),
      en: str(f, `v.${k}.en`) || undefined,
      fr: str(f, `v.${k}.fr`) || undefined,
      ru: str(f, `v.${k}.ru`) || undefined,
      ar: str(f, `v.${k}.ar`) || undefined,
      active: f.get(`v.${k}.active`) === "on",
      sortOrder: Number(str(f, `v.${k}.sortOrder`) || 0),
    }));
    await saveVariants(requireDb(), user, { productId: str(f, "productId"), variants });
    return done("Seçenekler kaydedildi.", revalidateStorefront("product"));
  });
}

export async function saveSpecAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("product.edit");
    await saveSpec(requireDb(), user, formObject(f));
    return done("Özellik kaydedildi (doğrulanana kadar vitrinde görünmez).", revalidateStorefront("product"));
  });
}
export async function verifySpecAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("spec.verify");
    await verifySpec(requireDb(), user, formObject(f));
    return done("Özellik doğrulandı; vitrinde gösterilir.", revalidateStorefront("product"));
  });
}
export async function deleteSpecAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("product.edit");
    await deleteSpec(requireDb(), user, str(f, "specId"));
    return "Özellik silindi.";
  });
}

export async function uploadDocumentAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("document.manage");
    const file = f.get("file");
    if (!(file instanceof File)) throw new AdminError("Dosya seçin.", { file: "Dosya seçin." });
    const locale = str(f, "locale");
    await uploadDocument(requireDb(), user, str(f, "productId"), file, str(f, "title"), (["tr", "en", "fr", "ru", "ar"].includes(locale) ? locale : null) as Locale | null);
    return "Doküman yüklendi (doğrulanana kadar vitrinde görünmez).";
  });
}
export async function setDocumentStatusAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("spec.verify");
    const db = requireDb();
    const status = str(f, "status") === "VERIFIED" ? "VERIFIED" : "UNVERIFIED";
    const doc = await db.productDocument.update({ where: { id: str(f, "documentId") }, data: { status } });
    await db.auditLog.create({ data: { actorId: user.id, action: status === "VERIFIED" ? "document.verified" : "document.unverified", entityType: "Product", entityId: doc.productId, after: { documentId: doc.id } } });
    return done(status === "VERIFIED" ? "Doküman doğrulandı; vitrinde gösterilir." : "Doküman vitrinden kaldırıldı.", revalidateStorefront("product"));
  });
}

export async function saveProductMediaAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("media.edit");
    const productId = str(f, "productId");
    const order = f.getAll("order").map(String);
    const remove = new Set(f.getAll("remove").map(String));
    await saveProductMedia(requireDb(), user, { productId, order: order.filter((id) => !remove.has(id)), primaryId: str(f, "primaryId") || undefined, attach: str(f, "attach") || undefined });
    return done("Görseller kaydedildi.", revalidateStorefront("product"));
  });
}

export async function uploadProductImageAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("media.upload");
    const file = f.get("file");
    if (!(file instanceof File)) throw new AdminError("Görsel seçin.", { file: "Görsel seçin." });
    const db = requireDb();
    const { asset, duplicate } = await uploadImage(db, user, file, str(f, "alt"));
    const productId = str(f, "productId");
    if (productId) {
      const links = await db.productMedia.findMany({ where: { productId }, orderBy: { sortOrder: "asc" }, select: { mediaId: true } });
      if (!links.some((l) => l.mediaId === asset.id)) await saveProductMedia(db, user, { productId, order: links.map((l) => l.mediaId), attach: asset.id });
    }
    revalidateStorefront("product");
    return duplicate ? "Bu görsel kütüphanede zaten vardı; mevcut kayıt kullanıldı." : "Görsel yüklendi.";
  });
}

export async function saveMediaTextAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("media.edit");
    await saveMediaText(requireDb(), user, formObject(f));
    return done("Alt metin kaydedildi.", revalidateStorefront("product"));
  });
}

export async function createProductAction(_p: ActionState, f: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const user = await requirePermission("product.edit");
    id = (await createProduct(requireDb(), user, formObject(f))).id;
    return "Oluşturuldu.";
  });
  if (r.ok && id) redirect(`/admin/products/${id}?created=1`);
  return r;
}

export async function bulkAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const op = str(f, "op");
    const user = await requirePermission(op === "archive" ? "product.archive" : "product.edit");
    const n = await bulkProducts(requireDb(), user, { ids: f.getAll("ids").map(String), op });
    return done(`${n} ürün ${op === "archive" ? "arşivlendi" : "taslağa alındı"}.`, revalidateStorefront("product"));
  });
}

export async function saveCategoryAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission(f.get("locale") === "tr" ? "category.edit" : "translation.publish");
    await saveCategoryTranslation(requireDb(), user, formObject(f));
    return done("Kategori kaydedildi.", revalidateStorefront("category", { layout: true }));
  });
}
