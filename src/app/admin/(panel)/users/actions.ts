"use server";

import { requirePermission } from "@/lib/auth/guard";
import type { ActionState } from "@/lib/admin/action-state";
import { formObject, runAction } from "@/lib/admin/run-action";
import { changeRole, createResetLink, inviteUser, revokeSessions, setUserActive } from "@/lib/admin/users";
import { requireDb } from "@/lib/db";

export async function inviteUserAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    const { link } = await inviteUser(requireDb(), actor, formObject(f));
    return { ok: "Kullanıcı oluşturuldu. Davet bağlantısını kişiye güvenli bir kanaldan iletin (48 saat geçerli, tek kullanımlık).", data: { link } };
  });
}

export async function resetLinkAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    const link = await createResetLink(requireDb(), actor, String(f.get("userId") ?? ""));
    return { ok: "Şifre sıfırlama bağlantısı oluşturuldu (48 saat, tek kullanımlık). Önceki açık bağlantılar iptal edildi.", data: { link } };
  });
}

export async function changeRoleAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    await changeRole(requireDb(), actor, formObject(f));
    return "Rol değiştirildi; kullanıcının açık oturumları sonlandırıldı.";
  });
}

export async function setActiveAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    const active = f.get("active") === "true";
    await setUserActive(requireDb(), actor, { userId: String(f.get("userId") ?? ""), active });
    return active ? "Kullanıcı etkinleştirildi." : "Kullanıcı pasif yapıldı; oturumları kapatıldı.";
  });
}

export async function revokeSessionsAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requirePermission("user.manage");
    const n = await revokeSessions(requireDb(), actor, String(f.get("userId") ?? ""));
    return `${n} oturum kapatıldı.`;
  });
}
