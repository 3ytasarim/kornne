"use server";

import { headers } from "next/headers";
import type { ActionState } from "@/lib/admin/action-state";
import { runAction } from "@/lib/admin/run-action";
import { auditBaseFor, runAndStoreSeoAudit } from "@/lib/admin/seo-audit";
import { requirePermission } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit-log";
import { verifyFiles } from "@/lib/seo/image-audit";
import { fillEmptyProductSeo } from "@/lib/admin/seo-fill";
import { revalidateStorefront } from "@/lib/admin/revalidate";

/** Runs the URL-level SEO audit against THIS application (target derived server-side, never from the form). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState signature
export async function runSeoAuditAction(_p: ActionState, _f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("seo.audit");
    const base = auditBaseFor((await headers()).get("host"));
    const r = await runAndStoreSeoAudit(requireDb(), user, { base });
    return `Denetim tamamlandı: ${r.urls} URL · ${r.errors} hata · ${r.warnings} uyarı.`;
  });
}

/** Re-hashes the 445 originals + served copies and sniffs real formats (read-only; nothing is rewritten). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState signature
export async function verifyMediaFilesAction(_p: ActionState, _f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("media.audit");
    const db = requireDb();
    const rows = await db.mediaAsset.findMany({ select: { publicPath: true, storageKey: true, sha256: true, mime: true } });
    const r = verifyFiles(rows);
    await writeAuditLog({ actorId: user.id, action: "media.files_verified", entityType: "MediaAsset", after: { rows: rows.length, checked: r.checked, servedMismatch: r.servedMismatch.length, originalMismatch: r.originalMismatch.length, missing: r.missing.length, mimeMismatch: r.mimeMismatch.length } });
    const bad = r.servedMismatch.length + r.originalMismatch.length + r.missing.length;
    return bad || r.mimeMismatch.length
      ? { error: `${rows.length} kayıt: hash farkı ${r.servedMismatch.length + r.originalMismatch.length}, eksik dosya ${r.missing.length}, biçim uyuşmazlığı ${r.mimeMismatch.length} (${r.mimeMismatch.slice(0, 3).map((m) => `${m.path}: ${m.db}→${m.real}`).join(", ")})` }
      : `${rows.length} kayıt · ${r.checked} dosya: SHA-256 orijinal + sunulan kopya birebir aynı, gerçek biçim = kayıtlı MIME.`;
  });
}

/** Fills EMPTY product SEO titles/descriptions (all languages) from each product's own content; typed values stay. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState signature
export async function fillEmptySeoAction(_p: ActionState, _f: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("seo.edit");
    const r = await fillEmptyProductSeo(requireDb(), user);
    revalidateStorefront("product");
    return r.titles || r.descriptions ? `${r.titles} SEO başlığı ve ${r.descriptions} SEO açıklaması dolduruldu (${r.translations} ürün metni). Elle girilmiş değerlere dokunulmadı.` : "Boş SEO alanı kalmadı.";
  });
}
