import type { PrismaClient } from "@prisma/client";
import { writeAuditLogVia } from "@/lib/audit-log";
import type { SessionUser } from "@/lib/auth/session";
import { runSeoAudit, type AuditMode, type AuditReport, type Finding } from "@/lib/seo/audit";
import { buildInventory } from "@/lib/seo/inventory";
import { isIndexable, seoLocales } from "@/lib/seo/site";
import { CATALOG_DATA_VERIFIED } from "@/lib/catalog";
import { AdminError } from "./action-state";
import { toCsv } from "./quotes";

/**
 * Admin › SEO QA (Sprint 8). The audit fetches THIS application only — the target is never user input (SSRF-safe):
 * the server's own loopback origin, or the configured SITE_URL origin. Results are stored in SeoAuditRun (URLs,
 * statuses and findings only — no personal data) and every run is written to the audit log.
 */
export type StoredPage = { path: string; kind: string; status: number; indexable: boolean; canonical: string | null; hreflang: string[]; title: string | null; location: string | null; findings: Finding[] };
export type StoredResults = { pages: StoredPage[]; sitemap: { urlCount: number; imageCount: number; findings: Finding[] }; robots: Finding[]; byCode: Record<string, number>; byKind: Record<string, number> };

/** Only loopback origins or the configured public origin are accepted. */
export function auditBaseFor(host: string | null, siteUrl = process.env.SITE_URL): string {
  if (host && /^(localhost|127\.0\.0\.1|\[::1\]):\d{2,5}$/.test(host)) return `http://${host.replace("localhost", "127.0.0.1")}`;
  if (siteUrl && /^https?:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(siteUrl)) return siteUrl.replace(/\/+$/, "");
  throw new AdminError("Denetim hedefi belirlenemedi (yalnız uygulamanın kendi adresi denetlenir).");
}

export function compact(report: AuditReport): StoredResults {
  return {
    pages: report.pages.map((p) => ({ path: p.path, kind: p.kind, status: p.status, indexable: p.indexable, canonical: p.canonical, hreflang: Object.keys(p.hreflang), title: p.title, location: p.location, findings: p.findings })),
    sitemap: { urlCount: report.sitemap.urlCount, imageCount: report.sitemap.imageCount, findings: report.sitemap.findings },
    robots: report.robots,
    byCode: report.summary.byCode,
    byKind: report.summary.byKind,
  };
}

export async function runAndStoreSeoAudit(db: PrismaClient, actor: Pick<SessionUser, "id">, opts: { base: string; fetchImpl?: typeof fetch; redirectSample?: number }) {
  const running = await db.seoAuditRun.findFirst({ where: { finishedAt: null, startedAt: { gt: new Date(Date.now() - 5 * 60_000) } }, select: { id: true } });
  if (running) throw new AdminError("Bir denetim zaten çalışıyor; birkaç dakika sonra tekrar deneyin.");
  const mode: AuditMode = isIndexable() ? "prodlike" : "dev";
  const run = await db.seoAuditRun.create({ data: { mode, baseUrl: opts.base, createdById: actor.id } });
  try {
    const inventory = await buildInventory(db, { seoLocales: seoLocales(), verified: CATALOG_DATA_VERIFIED, redirectSample: opts.redirectSample });
    const report = await runSeoAudit({ base: opts.base, mode, inventory, fetchImpl: opts.fetchImpl, concurrency: 4 });
    await db.seoAuditRun.update({ where: { id: run.id }, data: { finishedAt: new Date(report.finishedAt), urlCount: report.summary.urls, errorCount: report.summary.errors, warningCount: report.summary.warnings, results: compact(report) } });
    await writeAuditLogVia(db, { actorId: actor.id, action: "seo.audit_run", entityType: "SeoAuditRun", entityId: run.id, after: { mode, urls: report.summary.urls, errors: report.summary.errors, warnings: report.summary.warnings } });
    return { id: run.id, ...report.summary };
  } catch (e) {
    await db.seoAuditRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), errorCount: -1 } });
    throw e;
  }
}

/** CSV (no PII: URLs, statuses and findings only) — same formula-injection-safe writer as the quote export. */
export function auditCsv(results: StoredResults): string {
  const rows: unknown[][] = [["URL", "Tür", "HTTP", "İndekslenebilir", "Canonical", "hreflang", "Yönlendirme", "Önem", "Kod", "Bulgu", "Öneri"]];
  for (const p of results.pages) {
    const base = [p.path, p.kind, p.status, p.indexable ? "evet" : "hayır", p.canonical ?? "", p.hreflang.join(" "), p.location ?? ""];
    if (!p.findings.length) rows.push([...base, "", "", "", ""]);
    for (const f of p.findings) rows.push([...base, f.severity, f.code, f.message, f.fix]);
  }
  for (const f of results.sitemap.findings) rows.push(["/sitemap.xml", "sitemap", "", "", "", "", "", f.severity, f.code, f.message, f.fix]);
  for (const f of results.robots) rows.push(["/robots.txt", "robots", "", "", "", "", "", f.severity, f.code, f.message, f.fix]);
  return toCsv(rows);
}
