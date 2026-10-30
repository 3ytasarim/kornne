import type { PrismaClient } from "@prisma/client";
import { writeAuditLogVia } from "@/lib/audit-log";
import type { CommerceEnv } from "@/lib/commerce/gate";
import { merchantApiStatus } from "./api/client";
import { inputHash, toProductInput } from "./api/transform";
import { MerchantApiError, MerchantDisabledError, type MerchantClient, type MerchantTarget, type ProductInput } from "./api/types";
import { evaluateCatalog } from "./facts";
import { buildFeed } from "./feed";

/**
 * Merchant sync job (Sprint 9). Modes:
 *  - SIMULATED : plan only — what WOULD be sent (nothing is called at all) → status NOT_SENT
 *  - MOCK      : full adapter path against MockMerchantClient (in memory) → status MOCK_OK / MOCK_PARTIAL
 *  - LIVE      : refused unless merchantApiStatus() is enabled (it is not in Sprint 9) — no code path reaches Google
 * Only READY items are sent (feed builder re-checks). Idempotent: an item whose payload hash equals the last
 * successful run of the same mode is skipped; items that dropped out of READY are deleted (rollback of stale data).
 * Each run is a MerchantSyncRun row (the job/outbox record) + an audit-log entry.
 */
export type SyncMode = "SIMULATED" | "MOCK" | "LIVE";
export type SyncSummary = { label: "SIMULATED" | "MOCK"; ready: number; candidates: number; excluded: number; sent: string[]; skippedUnchanged: string[]; deleted: string[]; errors: { offerId: string; status: number | null; code: string | null; message: string }[]; hashes: Record<string, string>; byReason: Record<string, number> };

export async function runMerchantSync(db: PrismaClient, actor: { id: string } | null, opts: { mode: SyncMode; client?: MerchantClient; target?: MerchantTarget; env?: CommerceEnv; now?: Date }) {
  const env = opts.env ?? process.env;
  if (opts.mode === "LIVE") {
    const st = merchantApiStatus(opts.target?.accountId ?? null, env);
    if (!st.enabled) throw new MerchantDisabledError(st.reasons);
  }
  if (opts.mode === "MOCK" && opts.client?.kind !== "mock") throw new Error("MOCK mode requires the mock client");
  if (opts.mode === "LIVE" && opts.client?.kind !== "http") throw new Error("LIVE mode requires the http client");

  const { ctx, candidates, ready, byReason } = await evaluateCatalog(db, env, opts.now);
  const feed = buildFeed(candidates, ctx);
  const inputs: { input: ProductInput; hash: string }[] = [];
  for (const it of feed.items) {
    const input = toProductInput(it);
    inputs.push({ input, hash: await inputHash(input) });
  }
  const run = await db.merchantSyncRun.create({ data: { mode: opts.mode, status: "RUNNING", createdById: actor?.id ?? null } });

  const last = await db.merchantSyncRun.findFirst({ where: { mode: opts.mode, status: { in: ["MOCK_OK", "LIVE_OK", "NOT_SENT"] }, id: { not: run.id } }, orderBy: { startedAt: "desc" }, select: { summary: true } });
  const prev = ((last?.summary as SyncSummary | null)?.hashes ?? {}) as Record<string, string>;
  const summary: SyncSummary = { label: opts.mode === "SIMULATED" ? "SIMULATED" : "MOCK", ready: ready.length, candidates: candidates.length, excluded: feed.excluded.length, sent: [], skippedUnchanged: [], deleted: [], errors: [], hashes: {}, byReason };

  for (const { input, hash } of inputs) {
    summary.hashes[input.offerId] = hash;
    if (prev[input.offerId] === hash) {
      summary.skippedUnchanged.push(input.offerId);
      continue;
    }
    if (opts.mode === "SIMULATED") {
      summary.sent.push(input.offerId); // "would send"
      continue;
    }
    try {
      await opts.client!.insertProductInput(opts.target!, input, { idempotencyKey: `${run.id}:${input.offerId}:${hash.slice(0, 16)}` });
      summary.sent.push(input.offerId);
      // the real mapping table only reflects REAL submissions — a MOCK run never marks an item as synced
      if (opts.mode === "LIVE") await db.merchantItemMapping.updateMany({ where: { offerId: input.offerId, contentLanguage: input.contentLanguage, feedLabel: input.feedLabel }, data: { lastSyncedAt: new Date(), status: "PENDING" } });
    } catch (e) {
      delete summary.hashes[input.offerId]; // not confirmed → retried next run
      summary.errors.push({ offerId: input.offerId, status: e instanceof MerchantApiError ? e.httpStatus : null, code: e instanceof MerchantApiError ? e.googleStatus : e instanceof Error ? e.name : null, message: (e instanceof Error ? e.message : "unknown").slice(0, 200) });
    }
  }
  // items that were sent before but are no longer READY (price un-verified, stock unknown, unpublished) → remove
  for (const offerId of Object.keys(prev).filter((k) => !(k in summary.hashes) && !summary.errors.some((x) => x.offerId === k))) {
    if (opts.mode === "SIMULATED") {
      summary.deleted.push(offerId);
      continue;
    }
    try {
      await opts.client!.deleteProductInput(opts.target!, { offerId, contentLanguage: ctx.contentLanguage ?? "", feedLabel: ctx.feedLabel ?? "" });
      summary.deleted.push(offerId);
    } catch (e) {
      if (e instanceof MerchantApiError && e.httpStatus === 404) summary.deleted.push(offerId);
      else {
        summary.hashes[offerId] = prev[offerId]!; // keep tracking until the delete succeeds
        summary.errors.push({ offerId, status: e instanceof MerchantApiError ? e.httpStatus : null, code: "DELETE_FAILED", message: (e instanceof Error ? e.message : "unknown").slice(0, 200) });
      }
    }
  }
  const status = opts.mode === "SIMULATED" ? "NOT_SENT" : summary.errors.length ? (summary.sent.length ? `${opts.mode}_PARTIAL` : `${opts.mode}_FAILED`) : `${opts.mode}_OK`;
  await db.merchantSyncRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), itemCount: summary.sent.length, errorCount: summary.errors.length, summary: summary as object } });
  await writeAuditLogVia(db, { actorId: actor?.id ?? null, action: `merchant.sync_${opts.mode.toLowerCase()}`, entityType: "MerchantSyncRun", entityId: run.id, after: { status, ready: summary.ready, sent: summary.sent.length, skipped: summary.skippedUnchanged.length, deleted: summary.deleted.length, errors: summary.errors.length } });
  return { runId: run.id, status, summary };
}
