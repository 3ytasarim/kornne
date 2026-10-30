import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "./cookie";
import type { Role } from "./rbac";

/**
 * DB-backed admin sessions (Bifire src/lib/auth/session.ts, own code). The cookie holds a random 32-byte token;
 * the database stores only its SHA-256. 8h absolute lifetime (shorter than Bifire's 7 days: admin can change prices).
 */
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type SessionUser = { id: string; name: string; email: string; role: Role };

export async function createSession(userId: string, ipHash?: string) {
  if (!prisma) throw new Error("DATABASE_URL is not configured");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt, ipHash } });
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

/** Once per request (React cache): layout and page share the lookup. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!prisma) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const { id, name, email, role } = session.user;
  return { id, name, email, role };
});

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token && prisma) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}
