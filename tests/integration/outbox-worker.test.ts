import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backoffMs, DisabledTransport, notificationStatus, processOutbox, releaseBlocked, type NotificationTransport, type OutboxMessage } from "@/lib/notifications/outbox-worker";
import { cleanupTestSchema, hasTestDb, testDb } from "./test-schema";

/** Sprint 11 — outbox consumer on the ISOLATED database (kornne_it). No e-mail is ever sent: mock transport only. */
class MockTransport implements NotificationTransport {
  readonly kind = "mock" as const;
  sent: { msg: OutboxMessage; key: string }[] = [];
  failFor = 0;
  async send(msg: OutboxMessage, opts: { idempotencyKey: string }) {
    await new Promise((r) => setTimeout(r, 5));
    if (this.failFor > 0) {
      this.failFor--;
      throw new Error("SMTP 451 temporary failure");
    }
    this.sent.push({ msg, key: opts.idempotencyKey });
    return { providerId: `mock-${this.sent.length}` };
  }
}

describe.skipIf(!hasTestDb)("notification outbox worker (isolated DB, mock transport)", () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = testDb();
    expect((await db.$queryRawUnsafe<{ db: string }[]>("select current_database() db"))[0]!.db).toBe("kornne_it");
  });
  afterAll(async () => {
    await cleanupTestSchema(db);
    await db.$disconnect();
  });
  beforeEach(async () => {
    await cleanupTestSchema(db);
  });
  const enqueue = (n = 1) => Promise.all(Array.from({ length: n }, (_, i) => db.notificationOutbox.create({ data: { kind: "quote.created", channel: "email", entityType: "QuoteRequest", entityId: `it-${Date.now()}-${i}`, payload: { reference: `TKL-20261023-TEST${i}`, itemCount: 2 }, status: "BLOCKED" } })));

  it("is disabled by default and leaves BLOCKED rows untouched", async () => {
    expect(notificationStatus({}).enabled).toBe(false);
    expect(notificationStatus({}).reasons).toHaveLength(3);
    await enqueue(2);
    expect(await processOutbox(db, new DisabledTransport(), { adminBase: "http://localhost" })).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 0 });
    expect(await db.notificationOutbox.count({ where: { status: "BLOCKED" } })).toBe(2);
  });

  it("after release: each row is sent exactly once, even with two concurrent workers; no customer data in the mail", async () => {
    await enqueue(5);
    await releaseBlocked(db, "satis@kornne.test");
    const t = new MockTransport();
    const [a, b] = await Promise.all([processOutbox(db, t, { adminBase: "https://kornne.test" }), processOutbox(db, t, { adminBase: "https://kornne.test" })]);
    expect(a.sent + b.sent).toBe(5);
    expect(t.sent).toHaveLength(5);
    expect(new Set(t.sent.map((s) => s.key)).size).toBe(5); // idempotency key = outbox id
    expect(await db.notificationOutbox.count({ where: { status: "SENT", sentAt: { not: null } } })).toBe(5);
    expect(t.sent[0]!.msg.text).toMatch(/Referans: TKL-20261023-TEST\d/);
    expect(t.sent[0]!.msg.text).not.toMatch(/@|\+90/);
    // a second run sends nothing again
    expect((await processOutbox(db, t, { adminBase: "https://kornne.test" })).sent).toBe(0);
  });

  it("temporary failures retry with backoff, then FAILED after max attempts", async () => {
    const [row] = await enqueue(1);
    await releaseBlocked(db, "satis@kornne.test");
    const t = new MockTransport();
    t.failFor = 99;
    const start = Date.now();
    let r = await processOutbox(db, t, { adminBase: "x", maxAttempts: 3, now: new Date(start) });
    expect(r.retried).toBe(1);
    r = await processOutbox(db, t, { adminBase: "x", maxAttempts: 3, now: new Date(start + 10_000) });
    expect(r.skipped).toBe(1); // backoff not elapsed (1 min)
    r = await processOutbox(db, t, { adminBase: "x", maxAttempts: 3, now: new Date(start + backoffMs(1) + 5_000) });
    expect(r.retried).toBe(1);
    r = await processOutbox(db, t, { adminBase: "x", maxAttempts: 3, now: new Date(start + backoffMs(1) + backoffMs(2) + 60_000) });
    expect(r.failed).toBe(1);
    const final = await db.notificationOutbox.findUniqueOrThrow({ where: { id: row!.id } });
    expect(final).toMatchObject({ status: "FAILED", attempts: 3, lastError: "SMTP 451 temporary failure" });
  });
});
