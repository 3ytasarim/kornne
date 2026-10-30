"use server";

import { requirePermission } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import type { ActionState } from "@/lib/admin/action-state";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { deleteCategory, deleteProduct, setCategoryActive, setProductActive } from "@/lib/admin/row-actions";
import { runAction } from "@/lib/admin/run-action";
import { setUserActive } from "@/lib/admin/users";
import { setPageArchived } from "@/lib/cms/service";
import { requireDb } from "@/lib/db";

/** Row buttons in the admin lists ("Pasif yap / Aktif yap / Sil"). Every action re-checks the permission itself. */
const id = (f: FormData) => String(f.get("id") ?? "");
const on = (f: FormData) => f.get("active") === "true";

export async function productActiveAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("product.publish");
    await setProductActive(requireDb(), user, id(f), on(f));
    revalidateStorefront("product", { layout: true });
    return on(f) ? "Ürün yayına alındı." : "Ürün pasif yapıldı (vitrinde görünmez).";
  });
}

export async function productDeleteAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("product.archive");
    const r = await deleteProduct(requireDb(), user, id(f));
    revalidateStorefront("product", { layout: true });
    return r === "deleted" ? "Ürün silindi." : "Ürün arşive alındı (eski site ürünü veya sipariş/teklif geçmişi olduğu için kalıcı silinmedi; eski adres yönlendirmesi korunur).";
  });
}

export async function categoryActiveAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("category.edit");
    await setCategoryActive(requireDb(), user, id(f), on(f));
    revalidateStorefront("category", { layout: true });
    return on(f) ? "Kategori yayına alındı." : "Kategori pasif yapıldı.";
  });
}

export async function categoryDeleteAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("category.edit");
    const r = await deleteCategory(requireDb(), user, id(f));
    revalidateStorefront("category", { layout: true });
    return r === "deleted" ? "Kategori silindi." : "Kategori arşive alındı (eski site adresi korunur).";
  });
}

export async function pageArchiveAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("content.publish");
    const archive = !on(f);
    await setPageArchived(requireDb(), { id: user.id, canPublish: allowed(user.role, "content.publish") }, id(f), archive);
    revalidateStorefront("content", { layout: true });
    return archive ? "İçerik arşive alındı (sitede görünmez)." : "İçerik arşivden çıkarıldı; taslak olarak duruyor, yayınlamak için içeriği açın.";
  });
}

export async function userActiveAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("user.manage");
    await setUserActive(requireDb(), user, { userId: id(f), active: on(f) });
    return on(f) ? "Kullanıcı aktif yapıldı." : "Kullanıcı pasif yapıldı; oturumları kapatıldı.";
  });
}
