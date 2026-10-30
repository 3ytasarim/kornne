import "server-only";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

const SECRET_KEYS = /pass|token|secret|hash|iban|card|cvv/i;

/** Removes secret-looking fields before a snapshot is written to AuditLog. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? "[redacted]" : redact(v)]));
  }
  return typeof value === "bigint" ? value.toString() : value;
}

export async function writeAuditLog(entry: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown; ipHash?: string | null }) {
  if (!prisma) return;
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before === undefined ? undefined : (redact(entry.before) as object),
      after: entry.after === undefined ? undefined : (redact(entry.after) as object),
      ipHash: entry.ipHash ?? null,
    },
  });
}

/** Same entry, written through the caller's client (services take `db` — tests run them on the isolated database). */
export async function writeAuditLogVia(db: Pick<PrismaClient, "auditLog">, entry: { actorId?: string | null; action: string; entityType: string; entityId?: string | null; after?: unknown }) {
  await db.auditLog.create({ data: { actorId: entry.actorId ?? null, action: entry.action, entityType: entry.entityType, entityId: entry.entityId ?? null, after: entry.after === undefined ? undefined : (redact(entry.after) as object) } });
}
