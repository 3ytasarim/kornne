import type { Prisma, QuoteStatus } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit-log";
import { fmtDateTime } from "@/lib/admin/format";
import { toCsv } from "@/lib/admin/quotes";
import { allowed } from "@/lib/auth/rbac";
import { getSessionUser } from "@/lib/auth/session";
import { requireDb } from "@/lib/db";
import { getIpHash } from "@/lib/request-meta";
import { OUTCOME_LABEL, STATUS_LABEL } from "@/lib/quote/status-labels";

/**
 * CSV export of quote requests (contains PII) — quote.export only (SUPER_ADMIN / ADMIN), audited with the row
 * count, formula-injection-safe cells, no-store. GET + SameSite=strict session cookie: not triggerable cross-site.
 */
export const dynamic = "force-dynamic";
const STATUSES = ["NEW", "IN_REVIEW", "QUOTE_PREPARED", "RESPONDED", "CLOSED", "SPAM"];

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!allowed(user.role, "quote.export")) {
    await writeAuditLog({ actorId: user.id, action: "auth.denied", entityType: "Permission", entityId: "quote.export", ipHash: await getIpHash() });
    return new Response("Forbidden", { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const where: Prisma.QuoteRequestWhereInput = { isTest: false };
  const status = sp.get("durum") ?? "";
  if (STATUSES.includes(status)) where.status = status as QuoteStatus;
  else if (status === "acik") where.status = { in: ["NEW", "IN_REVIEW", "QUOTE_PREPARED"] };
  const rows = await requireDb().quoteRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 5000, include: { items: true, assignedTo: { select: { name: true } } } });
  const csv = toCsv([
    ["Referans", "Tarih", "Durum", "Sonuç", "Sorumlu", "Ürünler", "Ad soyad", "Firma", "E-posta", "Telefon", "Dil", "Kaynak"],
    ...rows.map((r) => [r.reference, fmtDateTime(r.createdAt), STATUS_LABEL[r.status], r.outcome ? OUTCOME_LABEL[r.outcome] : "", r.assignedTo?.name ?? "", r.items.map((i) => `${i.titleSnapshot}${i.variantLabel ? ` (${i.variantLabel})` : ""} x${i.quantity}`).join(" | "), r.name, r.company, r.email, r.phone, r.locale.toUpperCase(), r.source]),
  ]);
  await writeAuditLog({ actorId: user.id, action: "quote.exported", entityType: "QuoteRequest", after: { count: rows.length, filter: status || "all" }, ipHash: await getIpHash() });
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="teklif-talepleri-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
