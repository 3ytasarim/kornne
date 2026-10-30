import { writeAuditLog } from "@/lib/audit-log";
import { auditCsv, type StoredResults } from "@/lib/admin/seo-audit";
import { allowed } from "@/lib/auth/rbac";
import { getSessionUser } from "@/lib/auth/session";
import { requireDb } from "@/lib/db";
import { getIpHash } from "@/lib/request-meta";

/**
 * CSV export of one SEO audit run — seo.export (SUPER_ADMIN / ADMIN / SEO_EDITOR). Contains URLs, HTTP statuses and
 * findings only: no personal data. Audited, no-store, formula-injection-safe.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!allowed(user.role, "seo.export")) {
    await writeAuditLog({ actorId: user.id, action: "auth.denied", entityType: "Permission", entityId: "seo.export", ipHash: await getIpHash() });
    return new Response("Forbidden", { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("run") ?? "";
  const run = await requireDb().seoAuditRun.findFirst({ where: id ? { id } : { finishedAt: { not: null }, errorCount: { gte: 0 } }, orderBy: { startedAt: "desc" } });
  if (!run?.results) return new Response("Not found", { status: 404 });
  await writeAuditLog({ actorId: user.id, action: "seo.audit_exported", entityType: "SeoAuditRun", entityId: run.id, ipHash: await getIpHash() });
  return new Response(auditCsv(run.results as unknown as StoredResults), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="seo-denetim-${run.mode}-${run.startedAt.toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
