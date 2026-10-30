"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit-log";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { clearLoginAttempts, isLoginBlocked, recordFailedLogin } from "@/lib/rate-limit";
import { getIpHash } from "@/lib/request-meta";

/**
 * Admin login (adapted from Bifire src/app/admin/login/actions.ts): Zod validation, per-email + per-IP lockout,
 * constant-work verification (dummy Argon2 hash when the user does not exist), generic error message, audit log.
 * No default account exists — users are created with `npm run admin:create`.
 */
export type LoginState = { error?: string; email?: string };

const schema = z.object({
  email: z.email("Geçerli bir e-posta girin.").max(160),
  password: z.string().min(1, "Şifre girin.").max(200),
});

let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = schema.safeParse({ email: rawEmail, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin.", email: rawEmail };

  if (!prisma) return { error: "Yönetim paneli veritabanı bu ortamda yapılandırılmamış.", email: rawEmail };

  const { email, password } = parsed.data;
  const ipHash = await getIpHash();
  const keys = [`email:${email}`, `ip:${ipHash}`];
  if (await isLoginBlocked(keys)) return { error: "Çok fazla hatalı deneme. 15 dakika sonra tekrar deneyin.", email };

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), password);
  if (!user || !valid || !user.active) {
    await recordFailedLogin(keys);
    await writeAuditLog({ action: "auth.login_failed", entityType: "User", entityId: user?.id ?? null, ipHash });
    return { error: "E-posta veya şifre hatalı.", email };
  }

  await clearLoginAttempts(keys);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, ipHash);
  await writeAuditLog({ actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id, ipHash });
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}
