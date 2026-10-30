"use server";

import { requireAnyPermission, requirePermission } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import type { ActionState } from "@/lib/admin/action-state";
import { approvePrice, proposePrice, rejectPrice, revokePrice, setPriceDirect } from "@/lib/admin/prices";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { formObject, runAction } from "@/lib/admin/run-action";
import { requireDb } from "@/lib/db";

const s = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function proposePriceAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("price.propose");
    await proposePrice(requireDb(), user, formObject(f));
    return "Fiyat önerisi kaydedildi. Vitrin değişmedi: başka bir yetkilinin onayı gerekiyor.";
  });
}

export async function approvePriceAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("price.approve");
    await approvePrice(requireDb(), user, s(f, "priceId"), s(f, "note") || undefined);
    const failed = revalidateStorefront("product");
    return `Fiyat onaylandı ve vitrinde gösteriliyor. Online satış/ödeme bundan bağımsız olarak KAPALI kalır.${failed.length ? " Uyarı: önbellek yenilenemedi." : ""}`;
  });
}

export async function rejectPriceAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireAnyPermission(["price.approve", "price.propose"]);
    await rejectPrice(requireDb(), { id: user.id, canApprove: allowed(user.role, "price.approve") }, s(f, "priceId"), s(f, "note"));
    return "Öneri reddedildi / geri çekildi.";
  });
}

export async function revokePriceAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("price.approve");
    await revokePrice(requireDb(), user, s(f, "priceId"), s(f, "note"));
    revalidateStorefront("product");
    return "Onaylı fiyat geri alındı; vitrin yeniden “Fiyat için teklif alın” gösteriyor.";
  });
}

/** Product page "Fiyatı güncelle": approvers publish at once; editors without approval rights create a proposal. */
export async function quickPriceAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireAnyPermission(["price.approve", "price.propose"]);
    const raw = formObject(f);
    if (allowed(user.role, "price.approve")) {
      await setPriceDirect(requireDb(), user, raw);
      const failed = revalidateStorefront("product");
      return `Fiyat güncellendi ve vitrinde gösteriliyor.${failed.length ? " Uyarı: önbellek yenilenemedi." : ""}`;
    }
    await proposePrice(requireDb(), user, { ...raw, currency: "TRY", evidence: "Ürün sayfasından önerildi" });
    return "Fiyat önerisi kaydedildi; bir yönetici onaylayınca vitrine yansır.";
  });
}
