import { createHash } from "node:crypto";
import type { PrismaClient, QuoteStatus } from "@prisma/client";
import { z } from "zod";
import { allowed, isRole } from "@/lib/auth/rbac";
import { AdminError } from "./action-state";

/**
 * Quote CRM (docs/admin/quotes-crm-workflow.md). Builds on the Sprint 5 records — reference codes, item snapshots
 * and the "no price" rule are never changed. Every write is optimistic (QuoteRequest.version) so two operators
 * cannot silently overwrite each other, and every write leaves a status event / audit row WITHOUT personal data.
 */
export type Actor = { id: string };

export const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  NEW: ["IN_REVIEW", "SPAM"],
  IN_REVIEW: ["QUOTE_PREPARED", "CLOSED", "SPAM"],
  QUOTE_PREPARED: ["RESPONDED", "IN_REVIEW", "CLOSED"],
  RESPONDED: ["CLOSED", "IN_REVIEW"],
  CLOSED: ["IN_REVIEW"],
  SPAM: ["IN_REVIEW"],
};
export const OUTCOMES = ["won", "lost", "no_response", "duplicate"] as const;

export function canMoveQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  return QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

const statusSchema = z
  .object({
    id: z.string().min(10).max(40),
    version: z.coerce.number().int().min(0),
    to: z.enum(["NEW", "IN_REVIEW", "QUOTE_PREPARED", "RESPONDED", "CLOSED", "SPAM"]),
    note: z.string().trim().max(1000).optional(),
    // the select posts "" when nothing is chosen
    outcome: z.preprocess((v) => (v === "" ? undefined : v), z.enum(OUTCOMES).optional()),
  })
  .superRefine((v, ctx) => {
    // the panel does not send anything: the operator records HOW the quote reached the customer
    if (v.to === "RESPONDED" && (v.note ?? "").length < 5) ctx.addIssue({ code: "custom", path: ["note"], message: "Teklifin müşteriye nasıl iletildiğini yazın (örn. “e-posta ile gönderildi, 22.10”). Panel e-posta göndermez." });
    if (v.to === "CLOSED" && !v.outcome) ctx.addIssue({ code: "custom", path: ["outcome"], message: "Sonucu seçin." });
  });

function stale(): never {
  throw new AdminError("Bu talep siz incelerken başka biri tarafından güncellendi. Sayfayı yenileyip tekrar deneyin.");
}

export async function changeQuoteStatus(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = statusSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const q = await tx.quoteRequest.findUnique({ where: { id: v.id }, select: { id: true, status: true, version: true, isTest: true } });
    if (!q) throw new AdminError("Talep bulunamadı.");
    if (q.version !== v.version) stale();
    if (!canMoveQuote(q.status, v.to)) throw new AdminError(`“${q.status}” durumundan “${v.to}” durumuna geçilemez.`);
    const done = await tx.quoteRequest.updateMany({ where: { id: q.id, version: v.version, status: q.status }, data: { status: v.to, version: { increment: 1 }, outcome: v.to === "CLOSED" ? v.outcome : v.to === "IN_REVIEW" ? null : undefined } });
    if (done.count !== 1) stale();
    await tx.quoteStatusEvent.create({ data: { quoteRequestId: q.id, fromStatus: q.status, toStatus: v.to, actorId: actor.id, note: v.note || null } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "quote.status_changed", entityType: "QuoteRequest", entityId: q.id, before: { status: q.status }, after: { status: v.to, outcome: v.outcome ?? null } } });
    return v.version + 1;
  });
}

export async function assignQuote(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ id: z.string().min(10).max(40), version: z.coerce.number().int().min(0), assigneeId: z.string().max(40).optional() }).parse(raw);
  const assigneeId = v.assigneeId || null;
  if (assigneeId) {
    const u = await db.user.findUnique({ where: { id: assigneeId }, select: { active: true, role: true } });
    if (!u || !u.active || !isRole(u.role) || !allowed(u.role, "quote.manage")) throw new AdminError("Seçilen kullanıcı teklifleri yönetme yetkisine sahip değil.");
  }
  return db.$transaction(async (tx) => {
    const q = await tx.quoteRequest.findUnique({ where: { id: v.id }, select: { assignedToId: true, version: true } });
    if (!q) throw new AdminError("Talep bulunamadı.");
    const done = await tx.quoteRequest.updateMany({ where: { id: v.id, version: v.version }, data: { assignedToId: assigneeId, version: { increment: 1 } } });
    if (done.count !== 1) stale();
    await tx.auditLog.create({ data: { actorId: actor.id, action: "quote.assigned", entityType: "QuoteRequest", entityId: v.id, before: { assignedToId: q.assignedToId }, after: { assignedToId: assigneeId } } });
    return v.version + 1;
  });
}

export async function setQuoteFollowUp(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ id: z.string().min(10).max(40), version: z.coerce.number().int().min(0), followUpAt: z.string().trim().optional() }).parse(raw);
  const date = v.followUpAt ? new Date(`${v.followUpAt}T09:00:00+03:00`) : null;
  if (date && Number.isNaN(date.getTime())) throw new AdminError("Geçerli bir tarih girin.", { followUpAt: "Geçersiz tarih" });
  return db.$transaction(async (tx) => {
    const done = await tx.quoteRequest.updateMany({ where: { id: v.id, version: v.version }, data: { followUpAt: date, version: { increment: 1 } } });
    if (done.count !== 1) stale();
    await tx.auditLog.create({ data: { actorId: actor.id, action: "quote.follow_up_set", entityType: "QuoteRequest", entityId: v.id, after: { followUpAt: date?.toISOString() ?? null } } });
    return v.version + 1;
  });
}

/** Internal note (stored as plain text, rendered escaped; never visible to the customer). Audit keeps the id only. */
export async function addQuoteNote(db: PrismaClient, actor: Actor, raw: unknown) {
  const v = z.object({ id: z.string().min(10).max(40), body: z.string().trim().min(2, "Not boş olamaz.").max(4000) }).parse(raw);
  const q = await db.quoteRequest.findUnique({ where: { id: v.id }, select: { id: true } });
  if (!q) throw new AdminError("Talep bulunamadı.");
  const body = v.body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  const note = await db.quoteNote.create({ data: { quoteRequestId: q.id, authorId: actor.id, body } });
  await db.auditLog.create({ data: { actorId: actor.id, action: "quote.note_added", entityType: "QuoteRequest", entityId: q.id, after: { noteId: note.id, length: body.length } } });
  return note;
}

// ── CSV export ──

/** Spreadsheet formula injection guard: cells starting with = + - @ TAB CR are prefixed with an apostrophe. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: unknown[][]): string {
  // UTF-8 BOM so Excel opens Turkish characters correctly; CRLF line ends
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

/** Masks contact data for lists ("a***@k***.com", "+90 *** *** 02"). */
export function maskEmail(email: string | null): string {
  if (!email) return "—";
  const [user = "", domain = ""] = email.split("@");
  const [host = "", ...tld] = domain.split(".");
  return `${user.slice(0, 1)}***@${host.slice(0, 1)}***${tld.length ? "." + tld.join(".") : ""}`;
}
export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  return digits.length < 4 ? "***" : `*** *** ${digits.slice(-2)}`;
}

/** Stable, non-reversible key for a contact (email or phone) — used in admin URLs instead of the PII itself. */
export function contactKey(email: string | null, phone: string | null): string {
  return createHash("sha256").update(`kornne-contact:${email ? email.toLowerCase() : `tel:${(phone ?? "").replace(/\D/g, "")}`}`).digest("hex").slice(0, 24);
}
