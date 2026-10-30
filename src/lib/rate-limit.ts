import "server-only";
import { requireDb } from "@/lib/db";

/** Login lockout: 5 failures / 15 min per e-mail key AND per IP-hash key (Bifire src/lib/rate-limit.ts). */
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export async function isLoginBlocked(keys: string[]): Promise<boolean> {
  const db = requireDb();
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const counts = await Promise.all(keys.map((key) => db.loginAttempt.count({ where: { key, createdAt: { gte: since } } })));
  return counts.some((c) => c >= LOGIN_MAX_ATTEMPTS);
}

export async function recordFailedLogin(keys: string[]) {
  const db = requireDb();
  await db.loginAttempt.createMany({ data: keys.map((key) => ({ key })) });
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

export async function clearLoginAttempts(keys: string[]) {
  await requireDb().loginAttempt.deleteMany({ where: { key: { in: keys } } });
}
