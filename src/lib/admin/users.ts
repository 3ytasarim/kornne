import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, Role } from "@prisma/client";
import { z } from "zod";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { ROLES } from "@/lib/auth/rbac";
import { AdminError } from "./action-state";

/**
 * Admin users (Sprint 6). There is no default account and no e-mail provider yet, so onboarding works with a
 * ONE-TIME link: the super admin creates the user, sees the link once, hands it over out of band; the new user sets
 * a password. Only the SHA-256 of the token is stored. Same mechanism for password resets.
 * Guards: nobody changes their own role or deactivates themselves; the last active SUPER_ADMIN cannot be demoted.
 */
export type Actor = { id: string };
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
/** Marker hash for accounts that have not set a password yet — never verifies (not an Argon2 string). */
export const PENDING_PASSWORD = "!pending-invite";

const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");

async function issueLink(db: PrismaClient, userId: string, kind: "INVITE" | "RESET", createdById: string) {
  const token = randomBytes(32).toString("hex");
  // older open links for the same user stop working
  await db.userInvite.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await db.userInvite.create({ data: { userId, kind, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS), createdById } });
  return `/admin/davet/${token}`;
}

export async function inviteUser(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ email: z.email("Geçerli bir e-posta girin.").max(160), name: z.string().trim().min(2, "Ad girin.").max(120), role: z.enum(ROLES) }).parse(raw);
  const email = v.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new AdminError("Bu e-posta ile bir kullanıcı zaten var.", { email: "Kullanımda" });
  const user = await db.user.create({ data: { email, name: v.name, role: v.role, passwordHash: PENDING_PASSWORD, active: true } });
  const link = await issueLink(db, user.id, "INVITE", actor.id);
  await db.auditLog.create({ data: { actorId: actor.id, action: "user.invited", entityType: "User", entityId: user.id, after: { email, role: v.role } } });
  return { user, link };
}

export async function createResetLink(db: PrismaClient, actor: Actor, userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new AdminError("Kullanıcı bulunamadı.");
  const link = await issueLink(db, user.id, "RESET", actor.id);
  await db.auditLog.create({ data: { actorId: actor.id, action: "user.reset_link_created", entityType: "User", entityId: user.id } });
  return link;
}

async function activeSuperAdmins(db: PrismaClient) {
  return db.user.count({ where: { role: "SUPER_ADMIN", active: true, NOT: { passwordHash: PENDING_PASSWORD } } });
}

export async function changeRole(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ userId: z.string().min(10).max(40), role: z.enum(ROLES) }).parse(raw);
  if (v.userId === actor.id) throw new AdminError("Kendi rolünüzü değiştiremezsiniz.");
  const user = await db.user.findUnique({ where: { id: v.userId } });
  if (!user) throw new AdminError("Kullanıcı bulunamadı.");
  if (user.role === "SUPER_ADMIN" && v.role !== "SUPER_ADMIN" && user.active && (await activeSuperAdmins(db)) <= 1) throw new AdminError("Son aktif Süper Yönetici'nin rolü değiştirilemez.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: v.role as Role } });
    // new permissions apply on the next request; existing sessions are ended so the user re-authenticates
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "user.role_changed", entityType: "User", entityId: user.id, before: { role: user.role }, after: { role: v.role } } });
  });
}

export async function setUserActive(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ userId: z.string().min(10).max(40), active: z.boolean() }).parse(raw);
  if (v.userId === actor.id) throw new AdminError("Kendi hesabınızı pasif yapamazsınız.");
  const user = await db.user.findUnique({ where: { id: v.userId } });
  if (!user) throw new AdminError("Kullanıcı bulunamadı.");
  if (!v.active && user.role === "SUPER_ADMIN" && user.active && (await activeSuperAdmins(db)) <= 1) throw new AdminError("Son aktif Süper Yönetici pasif yapılamaz.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { active: v.active } });
    if (!v.active) {
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.userInvite.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: v.active ? "user.activated" : "user.deactivated", entityType: "User", entityId: user.id } });
  });
}

export async function revokeSessions(db: PrismaClient, actor: Actor, userId: string) {
  const r = await db.session.deleteMany({ where: { userId } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "user.sessions_revoked", entityType: "User", entityId: userId, after: { count: r.count } } });
  return r.count;
}

/** Looks up an open link (for the accept page) without consuming it. */
export async function findOpenInvite(db: PrismaClient, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const inv = await db.userInvite.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: { email: true, name: true, active: true } } } });
  if (!inv || inv.usedAt || inv.expiresAt < new Date() || !inv.user.active) return null;
  return inv;
}

export async function acceptInvite(db: PrismaClient, raw: unknown) {
  const v = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().max(200), confirm: z.string().max(200) }).parse(raw);
  const problems = passwordProblems(v.password);
  if (problems.length) throw new AdminError("Şifre yeterince güçlü değil.", { password: "En az 12 karakter ve en az 6 farklı karakter kullanın." });
  if (v.password !== v.confirm) throw new AdminError("Şifreler eşleşmiyor.", { confirm: "Şifreler eşleşmiyor." });
  const inv = await findOpenInvite(db, v.token);
  if (!inv) throw new AdminError("Bağlantı geçersiz veya süresi dolmuş. Yöneticinizden yeni bağlantı isteyin.");
  const passwordHash = await hashPassword(v.password);
  await db.$transaction(async (tx) => {
    // consume atomically: a link works exactly once even with two concurrent submissions
    const used = await tx.userInvite.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new AdminError("Bu bağlantı zaten kullanıldı.");
    await tx.user.update({ where: { id: inv.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: inv.userId } });
    await tx.auditLog.create({ data: { actorId: inv.userId, action: inv.kind === "INVITE" ? "user.invite_accepted" : "user.password_reset", entityType: "User", entityId: inv.userId } });
  });
  return inv.user.email;
}
