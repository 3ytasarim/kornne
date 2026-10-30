"use server";

import { requirePermission } from "@/lib/auth/guard";
import type { ActionState } from "@/lib/admin/action-state";
import { revalidateStorefront } from "@/lib/admin/revalidate";
import { runAction } from "@/lib/admin/run-action";
import { saveSetting, verifySetting } from "@/lib/cms/service";
import { requireDb } from "@/lib/db";

export async function saveSettingAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.edit");
    await saveSetting(requireDb(), user, String(f.get("key") ?? ""), String(f.get("value") ?? ""), String(f.get("source") ?? "") || undefined);
    revalidateStorefront("layout", { layout: true });
    return "Kaydedildi (değer yeniden doğrulama bekliyor).";
  });
}

export async function verifySettingAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("settings.verify");
    const verified = f.get("verified") === "true";
    await verifySetting(requireDb(), user, String(f.get("key") ?? ""), String(f.get("source") ?? ""), verified);
    revalidateStorefront("layout", { layout: true });
    return verified ? "Doğrulandı." : "Doğrulama kaldırıldı.";
  });
}
