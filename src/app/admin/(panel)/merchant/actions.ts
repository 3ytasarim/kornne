"use server";

import type { ActionState } from "@/lib/admin/action-state";
import { AdminError } from "@/lib/admin/action-state";
import { runAction } from "@/lib/admin/run-action";
import { writeAuditLogVia } from "@/lib/audit-log";
import { requirePermission } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { MockMerchantClient } from "@/lib/merchant/api/mock";
import { previewMapping } from "@/lib/merchant/mapping";
import { applyMerchantReview } from "@/lib/merchant/review";
import { runMerchantSync } from "@/lib/merchant/sync";
import { revalidateStorefront } from "@/lib/admin/revalidate";

/** SIMULATED (plan only) or MOCK (in-memory adapter) run. Neither contacts Google; LIVE is not offered at all. */
export async function runMerchantDryRunAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("merchant.simulate");
    const mode = f.get("mode") === "MOCK" ? "MOCK" : "SIMULATED";
    const r = await runMerchantSync(requireDb(), user, mode === "MOCK" ? { mode, client: new MockMerchantClient(), target: { accountId: "MOCK-ACCOUNT", dataSourceId: "MOCK-1" } } : { mode });
    return `${mode === "MOCK" ? "MOCK" : "SİMÜLASYON"} — GÖNDERİLMEDİ: ${r.summary.ready}/${r.summary.candidates} ürün hazır, ${r.summary.sent.length} ${mode === "MOCK" ? "sahte istemciye iletildi" : "gönderilecekti"}, ${r.summary.excluded} hariç.`;
  });
}

/** Old item_id CSV → preview only (stored as a MAPPING_PREVIEW run; no product or mapping row is written). */
export async function previewMappingAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("merchant.simulate");
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new AdminError("CSV dosyası seçin.", { file: "Dosya gerekli" });
    if (file.size > 2 * 1024 * 1024) throw new AdminError("Dosya 2 MB'tan büyük.", { file: "En fazla 2 MB" });
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new AdminError("Yalnız .csv / .tsv / .txt", { file: "CSV/TSV" });
    const db = requireDb();
    const result = await previewMapping(db, await file.text());
    if (!result.rows && result.errors.length) throw new AdminError(result.errors.join(" · "));
    const run = await db.merchantSyncRun.create({ data: { mode: "MAPPING_PREVIEW", status: "PREVIEW", finishedAt: new Date(), itemCount: result.matched.length, errorCount: result.unmatched.length + result.conflicts.length, summary: { file: file.name.slice(0, 120), ...result } as object, createdById: user.id } });
    await writeAuditLogVia(db, { actorId: user.id, action: "merchant.mapping_previewed", entityType: "MerchantSyncRun", entityId: run.id, after: { rows: result.rows, matched: result.matched.length, unmatched: result.unmatched.length, duplicates: result.duplicates.length, conflicts: result.conflicts.length } });
    return `Önizleme: ${result.rows} satır · ${result.matched.length} eşleşti · ${result.unmatched.length} eşleşmedi · ${result.duplicates.length} yinelenen · ${result.conflicts.length} çakışma. Hiçbir kayıt değiştirilmedi.`;
  });
}

/** Bulk review of REAL stock / lead time / brand / MPN (merchant.approve). Never contacts Google. */
export async function merchantReviewAction(_p: ActionState, f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("merchant.approve");
    const mpn: Record<string, string> = {};
    for (const [k, val] of f.entries()) if (k.startsWith("mpn:") && typeof val === "string") mpn[k.slice(4)] = val;
    const r = await applyMerchantReview(requireDb(), user, {
      productIds: f.getAll("productId").map(String),
      availability: String(f.get("availability") ?? ""),
      leadTimeDays: String(f.get("leadTimeDays") ?? ""),
      quantity: String(f.get("quantity") ?? ""),
      brand: String(f.get("brand") ?? ""),
      identifierNone: f.get("identifierNone") === "on",
      mpn,
      confirm: f.get("confirm") === "on" ? true : (undefined as unknown as true),
      note: String(f.get("note") ?? ""),
    });
    const failed = revalidateStorefront("product");
    return `${r.selected} ürün seçildi, ${r.changed} üründe değişiklik kaydedildi${r.brandVerified ? " · marka doğrulandı" : ""}${r.mpnSet ? ` · ${r.mpnSet} MPN` : ""}. Google'a hiçbir şey gönderilmedi.${failed.length ? ` (Önbellek yenilenemedi: ${failed.join(", ")})` : ""}`;
  });
}
