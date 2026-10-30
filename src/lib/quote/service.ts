import { randomInt } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { QUOTE_LIMITS, quoteInputSchema, type QuoteInput } from "./validation";

/**
 * Creates a quote request (Sprint 5 — the live commercial path while prices are unverified).
 * Pure business logic with an injected Prisma client → runs against the real dev DB (server action) and against the
 * isolated "kornne_test" schema (integration tests). No price is read or stored. No PII goes to logs/audit.
 */
export const PRIVACY_NOTICE_VERSION = "kvkk-legacy-unapproved-2026-10";
const RETENTION_DAYS = Number(process.env.QUOTE_RETENTION_DAYS || 730);
const RATE = { perIpPerHour: 5, perEmailPerHour: 3 } as const;
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // no 0/O/1/I/L/U

export type QuoteResult =
  | { ok: true; reference: string; duplicate: boolean }
  | { ok: false; code: "validation"; fields: Record<string, string> }
  | { ok: false; code: "spam" | "rate" | "items" | "error" };

export type QuoteContext = { ipHash: string | null; now?: Date; notifier?: QuoteNotifier };

/** Delivery channel for "new quote" notifications. No real e-mail/SMS/WhatsApp integration is enabled yet. */
export interface QuoteNotifier {
  newQuote(info: { reference: string; itemCount: number; locale: string }): Promise<void>;
}
export const noopNotifier: QuoteNotifier = { newQuote: async () => {} };

export function newReference(now = new Date()): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, "");
  let r = "";
  for (let i = 0; i < 6; i++) r += ALPHABET[randomInt(ALPHABET.length)];
  return `TKL-${d}-${r}`;
}

type Db = PrismaClient;

export async function createQuoteRequest(db: Db, raw: QuoteInput, ctx: QuoteContext): Promise<QuoteResult> {
  const now = ctx.now ?? new Date();
  const parsed = quoteInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fields[key]) fields[key] = key === "items" ? "items" : /^(required|invalidEmail|invalidPhone|contactRequired|items)$/.test(issue.message) ? issue.message : "invalid";
    }
    return { ok: false, code: "validation", fields };
  }
  const input = parsed.data;

  // bots: filled honeypot or impossibly fast / stale form
  const age = now.getTime() - input.startedAt;
  if (input.website || age < QUOTE_LIMITS.minFillMs || age > QUOTE_LIMITS.maxFormAgeMs) return { ok: false, code: "spam" };

  // idempotency: the same form submission (double click, retry) returns the original request
  const existing = await db.quoteRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { reference: true } });
  if (existing) return { ok: true, reference: existing.reference, duplicate: true };

  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [byIp, byEmail] = await Promise.all([
    ctx.ipHash ? db.quoteRequest.count({ where: { ipHash: ctx.ipHash, createdAt: { gte: hourAgo } } }) : 0,
    input.email ? db.quoteRequest.count({ where: { email: input.email.toLowerCase(), createdAt: { gte: hourAgo } } }) : 0,
  ]);
  if (byIp >= RATE.perIpPerHour || byEmail >= RATE.perEmailPerHour) return { ok: false, code: "rate" };

  // merge duplicate lines, then re-validate every product against the database (public + real variant)
  const merged = new Map<string, { productRef: string; variantId: string | null; quantity: number }>();
  for (const it of input.items) {
    const k = `${it.productRef}|${it.variantId ?? ""}`;
    const prev = merged.get(k);
    merged.set(k, { ...it, quantity: Math.min(QUOTE_LIMITS.maxQty, (prev?.quantity ?? 0) + it.quantity) });
  }
  const lines = [...merged.values()];
  const products = await db.product.findMany({
    where: { sourceKey: { in: [...new Set(lines.map((l) => `kornne.com:${l.productRef}`))] }, status: "PUBLISHED", needsReview: false },
    select: { id: true, sourceKey: true, translations: { select: { locale: true, title: true, slug: true, status: true } }, variants: { where: { active: true }, select: { id: true, labels: true } } },
  });
  const byKey = new Map(products.map((p) => [p.sourceKey!, p]));
  const items: Prisma.QuoteItemCreateManyQuoteRequestInput[] = [];
  for (const l of lines) {
    const p = byKey.get(`kornne.com:${l.productRef}`);
    if (!p) return { ok: false, code: "items" };
    const variant = l.variantId ? p.variants.find((v) => v.id === l.variantId) : null;
    if (l.variantId && !variant) return { ok: false, code: "items" };
    if (p.variants.length && !variant) return { ok: false, code: "items" };
    // snapshot what the visitor saw: their locale's page if it exists, otherwise the Turkish source
    const t = p.translations.find((x) => x.locale === input.locale && (x.status === "LEGACY_SOURCE" || x.status === "APPROVED")) ?? p.translations.find((x) => x.locale === "tr")!;
    const labels = (variant?.labels ?? {}) as Record<string, string>;
    items.push({ productId: p.id, sourceKey: p.sourceKey!, variantId: variant?.id ?? null, variantLabel: variant ? (labels[input.locale] ?? labels.tr ?? null) : null, titleSnapshot: t.title, slugSnapshot: t.slug, quantity: l.quantity });
  }

  const retainUntil = new Date(now.getTime() + RETENTION_DAYS * 86_400_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = newReference(now);
    try {
      const created = await db.$transaction(async (tx) => {
        const q = await tx.quoteRequest.create({
          data: {
            reference,
            source: input.source,
            locale: input.locale,
            name: input.name,
            company: input.company,
            email: input.email?.toLowerCase() ?? null,
            phone: input.phone,
            message: input.message,
            privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
            idempotencyKey: input.idempotencyKey,
            ipHash: ctx.ipHash,
            retainUntil,
            items: { createMany: { data: items } },
            events: { create: { toStatus: "NEW", note: "Mağaza teklif formundan oluşturuldu" } },
          },
          select: { id: true, reference: true },
        });
        // audit without personal data
        await tx.auditLog.create({ data: { action: "quote.created", entityType: "QuoteRequest", entityId: q.id, after: { reference: q.reference, itemCount: items.length, locale: input.locale, source: input.source }, ipHash: ctx.ipHash } });
        // transactional outbox: the sales-team notification is recorded with the request itself. No provider /
        // recipient is configured yet → BLOCKED (kept, never shown as sent). Payload = reference only, no PII.
        await tx.notificationOutbox.create({ data: { kind: "quote.created", channel: "email", entityType: "QuoteRequest", entityId: q.id, payload: { reference: q.reference, itemCount: items.length }, status: "BLOCKED", lastError: "Bildirim sağlayıcısı ve alıcı adresi tanımlı değil" } });
        return q;
      });
      await (ctx.notifier ?? noopNotifier).newQuote({ reference: created.reference, itemCount: items.length, locale: input.locale }).catch(() => {});
      return { ok: true, reference: created.reference, duplicate: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String((e.meta as { target?: unknown })?.target ?? "");
        // a concurrent duplicate submission won the race → return its reference
        const again = await db.quoteRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { reference: true } });
        if (again) return { ok: true, reference: again.reference, duplicate: true };
        if (target.includes("reference")) continue; // reference collision → new code
      }
      return { ok: false, code: "error" };
    }
  }
  return { ok: false, code: "error" };
}
