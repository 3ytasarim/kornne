import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../src/lib/auth/password";
import { testDatabaseUrl } from "../test-db-url.mjs";

/**
 * Throwaway admin for e2e: random e-mail + random password, created in global setup and deleted (with its
 * sessions, login attempts and audit rows) in teardown. Credentials live only in a gitignored temp file.
 */
const FILE = "test-results/.e2e-admin.json";
const STARTED = "test-results/.e2e-started";
export type TestAdmin = { id: string; email: string; password: string };

const db = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl("e2e") }) });

export async function createTestAdmin(): Promise<TestAdmin> {
  const prisma = db();
  try {
    const email = `e2e-${randomBytes(6).toString("hex")}@kornne.test`;
    const password = randomBytes(18).toString("base64url");
    const user = await prisma.user.create({ data: { email, name: "E2E Test", role: "SUPER_ADMIN", passwordHash: await hashPassword(password) } });
    const admin = { id: user.id, email, password };
    mkdirSync("test-results", { recursive: true });
    if (!existsSync(STARTED)) writeFileSync(STARTED, new Date(Date.now() - 1000).toISOString());
    writeFileSync(FILE, JSON.stringify(admin), { mode: 0o600 });
    return admin;
  } finally {
    await prisma.$disconnect();
  }
}

/** Extra throwaway user with a specific role (RBAC tests). Same @kornne.test domain → removed by deleteTestAdmins. */
export async function createTestUser(role: "PRODUCT_EDITOR" | "ORDER_OPERATOR" | "SEO_EDITOR" | "ADMIN"): Promise<TestAdmin> {
  const prisma = db();
  try {
    const email = `e2e-${role.toLowerCase()}-${randomBytes(4).toString("hex")}@kornne.test`;
    const password = randomBytes(18).toString("base64url");
    const user = await prisma.user.create({ data: { email, name: `E2E ${role}`, role, passwordHash: await hashPassword(password) } });
    return { id: user.id, email, password };
  } finally {
    await prisma.$disconnect();
  }
}

/** Quote requests submitted by e2e tests (contact e-mail on the reserved @kornne.test domain) + their audit rows. */
export async function deleteTestQuotes() {
  const prisma = db();
  try {
    const qs = await prisma.quoteRequest.findMany({ where: { email: { endsWith: "@kornne.test" } }, select: { id: true } });
    const ids = qs.map((q) => q.id);
    await prisma.auditLog.deleteMany({ where: { entityType: "QuoteRequest", entityId: { in: ids } } });
    await prisma.notificationOutbox.deleteMany({ where: { entityType: "QuoteRequest", entityId: { in: ids } } });
    await prisma.quoteRequest.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  } finally {
    await prisma.$disconnect();
  }
}

export function readTestAdmin(): TestAdmin {
  return JSON.parse(readFileSync(FILE, "utf8")) as TestAdmin;
}

export async function deleteTestAdmins() {
  const prisma = db();
  try {
    const users = await prisma.user.findMany({ where: { email: { endsWith: "@kornne.test" } }, select: { id: true, email: true } });
    const ids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
    // rows produced by the e2e run itself (failed-login test uses @kornne.test addresses; IP keys are localhost)
    const since = existsSync(STARTED) ? new Date(readFileSync(STARTED, "utf8")) : null;
    await prisma.loginAttempt.deleteMany({ where: { OR: [{ key: { endsWith: "@kornne.test" } }, ...(since ? [{ createdAt: { gte: since } }] : [])] } });
    if (since) await prisma.auditLog.deleteMany({ where: { action: { startsWith: "auth." }, createdAt: { gte: since } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await prisma.$disconnect();
    if (existsSync(FILE)) rmSync(FILE);
    if (existsSync(STARTED)) rmSync(STARTED);
  }
}
