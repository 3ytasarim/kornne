import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * KORNNE-only PostgreSQL. `prisma` is null when DATABASE_URL is not configured — callers must handle that
 * (admin login then refuses with a clear message instead of pretending to work).
 * Pattern from Bifire src/lib/db.ts (own code).
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | null | undefined };

function createPrismaClient(): PrismaClient | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  // pg treats sslmode=require like verify-full today; make it explicit so a future pg change cannot weaken it.
  const adapter = new PrismaPg({ connectionString: url.replace(/sslmode=require\b/, "sslmode=verify-full") });
  // Neon may need a few seconds to wake a suspended compute: generous wait for a transaction slot (P2028 otherwise)
  return new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 20_000 } });
}

export const prisma: PrismaClient | null = globalForPrisma.prisma !== undefined ? globalForPrisma.prisma : createPrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export function requireDb(): PrismaClient {
  if (!prisma) throw new Error("DATABASE_URL is not configured");
  return prisma;
}
