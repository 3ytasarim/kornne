"use server";

import { redirect } from "next/navigation";
import type { Locale } from "@prisma/client";
import { requirePermission } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { AdminError, type ActionState } from "@/lib/admin/action-state";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { formObject, runAction } from "@/lib/admin/run-action";
import { createPage, deleteMenuItem, publishPage, restoreRevision, saveBanner, saveFaq, saveMenuItem, savePageDraft, setLegalApproval, setPageArchived, submitForReview, unpublishPage } from "@/lib/cms/service";
import { requireDb } from "@/lib/db";
import { LOCALES } from "@/lib/i18n/config";

const loc = (v: FormDataEntryValue | null): Locale => {
  if (typeof v === "string" && (LOCALES as readonly string[]).includes(v)) return v as Locale;
  throw new AdminError("Geçersiz dil.");
};
const s = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createPageAction(_p: ActionState, f: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => {
    const user = await requirePermission("content.edit");
    id = (await createPage(requireDb(), { id: user.id, canPublish: allowed(user.role, "content.publish") }, formObject(f))).page.id;
    return "Oluşturuldu.";
  });
  if (r.ok && id) redirect(`/admin/content/${id}?dil=${s(f, "locale") || "tr"}`);
  return r;
}

export async function savePageAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("content.edit");
    const r = await savePageDraft(requireDb(), { id: user.id, canPublish: allowed(user.role, "content.publish") }, formObject(f));
    return r.sanitized ? "Taslak kaydedildi. Not: güvenlik filtresi izin verilmeyen HTML öğelerini kaldırdı. Yayındaki sürüm değişmedi." : "Taslak kaydedildi. Yayındaki sürüm, yeniden yayınlanana kadar değişmez.";
  });
}

export async function submitReviewAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("content.edit");
    await submitForReview(requireDb(), { id: user.id, canPublish: allowed(user.role, "content.publish") }, s(f, "pageId"), loc(f.get("locale")));
    return "İncelemeye gönderildi; bir yayıncı onaylayınca yayına çıkar.";
  });
}

export async function publishPageAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("content.publish");
    const path = await publishPage(requireDb(), { id: user.id, canPublish: true }, s(f, "pageId"), loc(f.get("locale")));
    const failed = revalidateStorefront("content", { layout: true });
    return `Yayınlandı: ${path}${failed.length ? " (uyarı: önbellek yenilenemedi)" : ""}`;
  });
}

export async function unpublishPageAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("content.publish");
    await unpublishPage(requireDb(), { id: user.id, canPublish: true }, s(f, "pageId"), loc(f.get("locale")));
    revalidateStorefront("content", { layout: true });
    return "Yayından kaldırıldı (taslağa döndü). Bu dildeki adres artık 404 döner; menü bağlantısı otomatik gizlenir.";
  });
}

export async function restoreRevisionAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("content.edit");
    await restoreRevision(requireDb(), { id: user.id, canPublish: allowed(user.role, "content.publish") }, s(f, "revisionId"));
    return "Eski sürüm çalışma kopyasına geri yüklendi. Yayına almak için yayınlayın.";
  });
}

export async function archivePageAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("content.publish");
    const archived = s(f, "archived") === "true";
    await setPageArchived(requireDb(), { id: user.id, canPublish: true }, s(f, "pageId"), archived);
    revalidateStorefront("content", { layout: true });
    return archived ? "Arşivlendi; tüm dillerde yayından kalktı." : "Arşivden çıkarıldı (taslak).";
  });
}

export async function legalApprovalAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.verify");
    const approve = s(f, "approve") === "true";
    await setLegalApproval(requireDb(), user, s(f, "pageId"), approve ? s(f, "reference") : null);
    revalidateStorefront("content");
    return approve ? "Hukuki onay kaydedildi." : "Hukuki onay kaldırıldı.";
  });
}

export async function saveFaqAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("faq.edit");
    const row = await saveFaq(requireDb(), { id: user.id, canPublish: allowed(user.role, "content.publish") }, formObject(f));
    revalidateStorefront("content", { layout: true });
    if (row.productId) revalidateStorefront("product");
    return row.state === "PUBLISHED" ? "Kaydedildi ve yayında." : row.state === "REVIEW" ? "Kaydedildi; yayın onayı bekliyor." : "Taslak kaydedildi.";
  });
}

export async function saveBannerAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("banner.edit");
    const translations = LOCALES.map((l) => ({ locale: l, title: s(f, `t.${l}.title`), text: s(f, `t.${l}.text`) || undefined, ctaLabel: s(f, `t.${l}.cta`) || undefined }));
    const b = await saveBanner(requireDb(), { id: user.id, canPublish: allowed(user.role, "content.publish") }, { ...formObject(f), translations, startsAt: s(f, "startsAt") ? new Date(`${s(f, "startsAt")}:00+03:00`).toISOString() : undefined, endsAt: s(f, "endsAt") ? new Date(`${s(f, "endsAt")}:00+03:00`).toISOString() : undefined });
    revalidateStorefront("content", { layout: true });
    return b.state === "PUBLISHED" ? "Kaydedildi; tarih aralığında yayında." : b.state === "REVIEW" ? "Kaydedildi; yayın onayı bekliyor." : "Taslak kaydedildi.";
  });
}

export async function saveMenuAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("menu.edit");
    const labels = Object.fromEntries(LOCALES.map((l) => [l, s(f, `label.${l}`)]));
    await saveMenuItem(requireDb(), user, { ...formObject(f), labels, active: f.get("active") === "on" });
    revalidateStorefront("layout", { layout: true });
    return "Menü kaydedildi; vitrinde güncellendi.";
  });
}

export async function deleteMenuAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("menu.edit");
    await deleteMenuItem(requireDb(), user, s(f, "id"));
    revalidateStorefront("layout", { layout: true });
    return "Menü öğesi kaldırıldı.";
  });
}
