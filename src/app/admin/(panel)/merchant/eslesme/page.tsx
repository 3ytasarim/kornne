import Link from "next/link";
import { ActionForm, FormMessage, SubmitButton } from "@/components/admin/forms";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { MERCHANT_NAV } from "@/components/admin/subnavs";
import { Card, ModuleState, SubNav } from "@/components/admin/ui";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import type { MappingResult } from "@/lib/merchant/mapping";
import { previewMappingAction } from "../actions";

export const metadata = { title: "Eski item_id eşleme" };
export const dynamic = "force-dynamic";

/**
 * Admin › Merchant › Eski item_id eşleme (Sprint 9): preview of how the EXISTING Merchant item ids map to the new
 * catalog. Read-only: the CSV is parsed in memory, the result is shown; no mapping row is written. Keeping the
 * old ids avoids duplicate products and lost history in Merchant / Ads.
 */
export default async function MappingPage() {
  const user = await requireAdmin("merchant");
  const db = requireDb();
  const [last, stored] = await Promise.all([
    db.merchantSyncRun.findFirst({ where: { mode: "MAPPING_PREVIEW" }, orderBy: { startedAt: "desc" } }),
    db.merchantItemMapping.count(),
  ]);
  const r = (last?.summary ?? null) as (MappingResult & { file?: string }) | null;
  return (
    <>
      <PageHeader title="Eski item_id → yeni ürün eşleme önizlemesi" description="Mevcut Merchant Center hesabından SALT-OKUNUR dışa aktarılan ürün listesini (CSV/TSV: id, title, link, language, feed label) yükleyin. Eşleşmeler, yinelenenler ve çakışmalar raporlanır; hiçbir kayıt yazılmaz, Google'a bağlanılmaz." actions={<ModuleState state="live" title="Önizleme" />} />
      <SubNav items={MERCHANT_NAV} current="/admin/merchant/eslesme" />
      <Notice className="mb-6">Kayıtlı eşleme: <strong>{stored}</strong>. Dışa aktarım dosyası henüz müşteriden alınmadı — bu ekran dosya geldiğinde kullanılacak. Eski id’ler ASLA yeniden üretilmez; eşleşme onayı ayrı bir kararla kaydedilir (Sprint 10+).</Notice>
      {allowed(user.role, "merchant.simulate") ? (
        <Card className="mb-6" title="CSV yükle (önizleme)" description="En fazla 2 MB · 5000 satır · dosya sunucuda saklanmaz.">
          <ActionForm action={previewMappingAction} className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end" aria-label="Eşleme önizlemesi" resetOnOk>
            <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
              Merchant dışa aktarım dosyası
              <input type="file" name="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" required className="w-full min-w-0 min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface p-2 text-sm font-normal" />
            </label>
            <SubmitButton pendingText="İşleniyor…">Önizle</SubmitButton>
            <FormMessage className="md:col-span-2" />
          </ActionForm>
        </Card>
      ) : null}
      {!r ? (
        <Notice>Henüz önizleme yapılmadı.</Notice>
      ) : (
        <>
          <p className="mb-3 text-sm text-steel">
            Son önizleme: {fmtDateTime(last!.startedAt)} · {r.file}
          </p>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Satır" value={r.rows} />
            <StatCard label="Eşleşti" value={r.matched.length} tone="success" />
            <StatCard label="Eşleşmedi" value={r.unmatched.length} tone={r.unmatched.length ? "warning" : "success"} />
            <StatCard label="Yinelenen id" value={r.duplicates.length} tone={r.duplicates.length ? "warning" : "success"} />
            <StatCard label="Çakışma" value={r.conflicts.length} tone={r.conflicts.length ? "warning" : "success"} />
          </div>
          {r.conflicts.length || r.duplicates.length ? (
            <Card className="mb-6" title="Çakışmalar ve yinelenenler">
              <ul className="space-y-1 text-sm">
                {r.conflicts.map((c, i) => (
                  <li key={`c${i}`}>{c.detail}</li>
                ))}
                {r.duplicates.map((d) => (
                  <li key={`d${d.offerId}`}>
                    <code>{d.offerId}</code> satırlar {d.lines.join(", ")}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card className="mb-6" title={`Eşleşenler (${r.matched.length})`}>
            <ul className="divide-y divide-line text-sm">
              {r.matched.slice(0, 200).map((m) => (
                <li key={`${m.line}`} className="py-1.5">
                  <code>{m.offerId}</code> → <Link href={`/admin/products/${m.productId}`} className="underline">#{m.ref} {m.title}</Link> <span className="text-xs text-steel">({m.by === "link" ? "bağlantı" : "id numarası"} · {m.language || "dil?"} · {m.feedLabel || "feedLabel?"})</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title={`Eşleşmeyenler (${r.unmatched.length})`}>
            <ul className="divide-y divide-line text-sm">
              {r.unmatched.slice(0, 200).map((u) => (
                <li key={`${u.line}`} className="py-1.5">
                  satır {u.line}: <code>{u.offerId}</code> {u.title} <span className="text-xs text-steel">— {u.reason}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
