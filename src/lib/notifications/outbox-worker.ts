import type { PrismaClient } from "@prisma/client";

/**
 * Notification outbox consumer (Sprint 11) — READY BUT DISABLED. Quote requests already write a transactional outbox
 * row (status BLOCKED, payload = reference + item count, no customer data). When the client chooses an e-mail
 * provider and a recipient, this worker delivers those rows:
 *  - release: BLOCKED → PENDING (recipient filled) only when a real provider + recipient are configured
 *  - claim: optimistic, per attempt (`attempts` compare-and-set) → two workers can never send the same attempt
 *  - retry: exponential backoff (1, 2, 4, 8 … min), FAILED after `maxAttempts`; provider gets the row id as
 *    idempotency key so a retried send after a lost response is de-duplicated by the provider
 * No schema change: uses the existing NotificationOutbox columns.
 */
export type OutboxMessage = { id: string; kind: string; to: string; subject: string; text: string };
export interface NotificationTransport {
  readonly kind: "disabled" | "mock" | "provider";
  send(msg: OutboxMessage, opts: { idempotencyKey: string }): Promise<{ providerId: string }>;
}

export class DisabledTransport implements NotificationTransport {
  readonly kind = "disabled" as const;
  async send(): Promise<never> {
    throw new Error("notification provider not configured");
  }
}

type Env = Partial<Record<string, string | undefined>>;
/** Delivery is possible only with an explicit provider choice, a recipient and the rotated secrets confirmation. */
export function notificationStatus(env: Env = process.env): { enabled: boolean; recipient: string | null; reasons: string[] } {
  const reasons: string[] = [];
  const recipient = env.NOTIFY_QUOTE_RECIPIENT?.trim() || null;
  if (!env.NOTIFY_PROVIDER) reasons.push("e-posta sağlayıcısı seçilmedi (NOTIFY_PROVIDER)");
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(recipient)) reasons.push("teklif bildirimi alıcısı tanımlı değil (NOTIFY_QUOTE_RECIPIENT)");
  if (env.SECRETS_ROTATION_CONFIRMED !== "true") reasons.push("sır rotasyonu doğrulanmadı");
  return { enabled: reasons.length === 0, recipient, reasons };
}

export function backoffMs(attempts: number): number {
  return Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;
}

function render(row: { id: string; kind: string; payload: unknown }, to: string, adminBase: string): OutboxMessage {
  const p = (row.payload ?? {}) as { reference?: string; itemCount?: number };
  if (row.kind === "quote.created") {
    return {
      id: row.id,
      kind: row.kind,
      to,
      subject: `Yeni teklif talebi ${p.reference ?? ""}`.trim(),
      // internal sales notification: reference + count + admin link; the customer's details stay in the admin
      text: `Yeni teklif talebi alındı.\nReferans: ${p.reference ?? "-"}\nÜrün sayısı: ${p.itemCount ?? "-"}\nAyrıntılar (giriş gerekir): ${adminBase}/admin/quotes`,
    };
  }
  throw new Error(`unknown notification kind ${row.kind}`);
}

export async function releaseBlocked(db: PrismaClient, recipient: string) {
  return db.notificationOutbox.updateMany({ where: { status: "BLOCKED", channel: "email" }, data: { status: "PENDING", recipient, lastError: null } });
}

export async function processOutbox(db: PrismaClient, transport: NotificationTransport, opts: { adminBase: string; now?: Date; batch?: number; maxAttempts?: number }) {
  const now = opts.now ?? new Date();
  const maxAttempts = opts.maxAttempts ?? 5;
  const result = { sent: 0, retried: 0, failed: 0, skipped: 0 };
  if (transport.kind === "disabled") return result;
  const rows = await db.notificationOutbox.findMany({ where: { status: "PENDING", channel: "email", recipient: { not: null } }, orderBy: { createdAt: "asc" }, take: opts.batch ?? 20 });
  for (const row of rows) {
    if (row.attempts > 0 && row.updatedAt.getTime() + backoffMs(row.attempts) > now.getTime()) {
      result.skipped++;
      continue;
    }
    // claim THIS attempt (compare-and-set on attempts): a concurrent worker gets count 0 and skips the row
    const claim = await db.notificationOutbox.updateMany({ where: { id: row.id, status: "PENDING", attempts: row.attempts }, data: { attempts: row.attempts + 1 } });
    if (claim.count !== 1) {
      result.skipped++;
      continue;
    }
    try {
      await transport.send(render(row, row.recipient!, opts.adminBase), { idempotencyKey: row.id });
      await db.notificationOutbox.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      result.sent++;
    } catch (e) {
      const last = row.attempts + 1 >= maxAttempts;
      await db.notificationOutbox.update({ where: { id: row.id }, data: { status: last ? "FAILED" : "PENDING", lastError: (e instanceof Error ? e.message : "send failed").slice(0, 200) } });
      if (last) result.failed++;
      else result.retried++;
    }
  }
  return result;
}
