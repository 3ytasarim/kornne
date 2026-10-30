"use server";

import type { ActionState } from "@/lib/admin/action-state";
import { formObject, runAction } from "@/lib/admin/run-action";
import { acceptInvite } from "@/lib/admin/users";
import { requireDb } from "@/lib/db";
import { isLoginBlocked, recordFailedLogin } from "@/lib/rate-limit";
import { getIpHash } from "@/lib/request-meta";

/** Public (token-authenticated) action: rate-limited per IP with the login lockout table. */
export async function acceptInviteAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const key = `invite-ip:${await getIpHash()}`;
  if (await isLoginBlocked([key])) return { error: "Çok fazla deneme. 15 dakika sonra tekrar deneyin.", at: Date.now() };
  const r = await runAction(async () => {
    await acceptInvite(requireDb(), formObject(f));
    return "Şifreniz kaydedildi. Artık giriş yapabilirsiniz.";
  });
  if (r.error && !r.fields) await recordFailedLogin([key]);
  return r;
}
