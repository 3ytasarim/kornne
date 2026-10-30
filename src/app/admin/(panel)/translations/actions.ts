"use server";

import type { Locale } from "@prisma/client";
import { requirePermission } from "@/lib/auth/guard";
import { AdminError, type ActionState } from "@/lib/admin/action-state";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { formObject, runAction } from "@/lib/admin/run-action";
import { approveMatch, publishProductTranslation, rejectMatch, rematch, reopenMatch, unpublishProductTranslation } from "@/lib/admin/translations";
import { requireDb } from "@/lib/db";

const loc = (v: FormDataEntryValue | null): Locale => {
  if (v === "en" || v === "fr" || v === "ru" || v === "ar") return v;
  throw new AdminError("Geçersiz dil.");
};

export async function approveMatchAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("translation.decide");
    const r = await approveMatch(requireDb(), user, formObject(f));
    return `Onaylandı: ${r.title} (${r.locale.toUpperCase()}) — editör taslağı oluşturuldu, henüz yayında değil.`;
  });
}

export async function rejectMatchAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("translation.decide");
    await rejectMatch(requireDb(), user, formObject(f));
    return "Reddedildi.";
  });
}

export async function reopenMatchAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("translation.decide");
    await reopenMatch(requireDb(), user, String(f.get("id") ?? ""));
    return "Öneri yeniden incelemeye açıldı.";
  });
}

export async function rematchAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("translation.decide");
    await rematch(requireDb(), user, formObject(f));
    return "Öneri yeni ürünle eşleştirildi; onay ayrıca verilmeli.";
  });
}

export async function publishTranslationAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("translation.publish");
    const path = await publishProductTranslation(requireDb(), user, String(f.get("productId") ?? ""), loc(f.get("locale")));
    const failed = revalidateStorefront("product");
    return failed.length ? `Yayınlandı: ${path}. Uyarı: önbellek yenilenemedi.` : `Yayınlandı: ${path}`;
  });
}

export async function unpublishTranslationAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("translation.publish");
    await unpublishProductTranslation(requireDb(), user, String(f.get("productId") ?? ""), loc(f.get("locale")));
    revalidateStorefront("product");
    return "Yayından kaldırıldı; eski adres önceki hedefine döndü.";
  });
}
