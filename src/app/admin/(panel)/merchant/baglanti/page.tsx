import { ActionForm, FormMessage, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { MERCHANT_NAV } from "@/components/admin/subnavs";
import { Card, KeyValues, ModuleState, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { MERCHANT_API_BASE, merchantApiStatus } from "@/lib/merchant/api/client";
import type { SyncSummary } from "@/lib/merchant/sync";
import { runMerchantDryRunAction } from "../actions";

export const metadata = { title: "Merchant API bağlantısı" };
export const dynamic = "force-dynamic";
const SETTING_KEYS = ["merchant.accountId", "merchant.dataSourceId", "merchant.targetCountry", "merchant.contentLanguage", "merchant.feedLabel"] as const;

/**
 * Admin › Merchant › API bağlantısı (Sprint 9): HONEST connection status (BAĞLI DEĞİL), the opt-in conditions that
 * are still missing, the unverified target config and the job history (SIMULATED / MOCK runs only).
 */
export default async function MerchantConnectionPage() {
  const user = await requireAdmin("merchant");
  const db = requireDb();
  const [settings, runs] = await Promise.all([
    db.siteSetting.findMany({ where: { key: { in: [...SETTING_KEYS] } }, select: { key: true, value: true, status: true } }),
    db.merchantSyncRun.findMany({ where: { mode: { in: ["SIMULATED", "MOCK", "LIVE"] } }, orderBy: { startedAt: "desc" }, take: 10 }),
  ]);
  const account = settings.find((s) => s.key === "merchant.accountId" && s.status === "VERIFIED");
  const api = merchantApiStatus(account ? String(account.value ?? "") : null);
  const canRun = allowed(user.role, "merchant.simulate");
  return (
    <>
      <PageHeader title="Merchant API bağlantısı" description="Güncel Merchant API (products_v1) adaptörü hazır; bağlantı varsayılan olarak KAPALI. Bu ekrandan Google’a veri gönderilemez." actions={<ModuleState state="blocked" title="BAĞLI DEĞİL" />} />
      <SubNav items={MERCHANT_NAV} current="/admin/merchant/baglanti" />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone="signal">BAĞLI DEĞİL</Badge>
        <Badge tone="outline">GÖNDERİLMEDİ</Badge>
        <span className="min-w-0 text-sm break-all text-steel">Uç nokta: {MERCHANT_API_BASE}/products/v1 · Content API for Shopping kullanılmıyor (kapatıldı: 18.08.2026)</span>
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Bağlantıyı açmak için eksik koşullar" description="Hepsi sağlanmadan istemci oluşturulamaz (kodda zorunlu).">
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {api.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
        <Card title="Hedef yapılandırma (Admin › Ayarlar)" description="Mevcut hesaptan salt-okunur teyit edilip süper yönetici tarafından doğrulanmalı.">
          <KeyValues rows={SETTING_KEYS.map((k) => {
            const s = settings.find((x) => x.key === k);
            return [k.replace("merchant.", ""), s ? <span key={k}>{String(s.value ?? "") || "—"} {s.status === "VERIFIED" ? <Badge tone="success">doğrulandı</Badge> : <Badge tone="warning">teyitsiz</Badge>}</span> : <Badge key={k} tone="outline">girilmedi</Badge>];
          })} />
        </Card>
      </div>
      {canRun ? (
        <Card className="mb-6" title="Kuru çalıştırma" description="SİMÜLASYON: yalnız plan. MOCK: tüm adaptör yolu (dönüştürme, idempotency, hata/yeniden deneme) bellek içi sahte istemciyle. İkisi de Google'a bağlanmaz.">
          <div className="flex flex-wrap gap-3">
            {(["SIMULATED", "MOCK"] as const).map((m) => (
              <ActionForm key={m} action={runMerchantDryRunAction} className="flex flex-wrap items-center gap-3" aria-label={`${m} çalıştır`}>
                <input type="hidden" name="mode" value={m} />
                <SubmitButton variant={m === "MOCK" ? "secondary" : "primary"} pendingText="Çalışıyor…">
                  {m === "MOCK" ? "MOCK senkron" : "Simülasyon"}
                </SubmitButton>
                <FormMessage />
              </ActionForm>
            ))}
          </div>
        </Card>
      ) : null}
      <Card className="mb-6" title="İş geçmişi">
        {!runs.length ? (
          <p className="text-sm text-steel">Henüz çalıştırma yok.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {runs.map((r) => {
              const s = r.summary as SyncSummary | null;
              return (
                <li key={r.id} className="py-2">
                  <Badge tone="outline">{r.mode === "MOCK" ? "MOCK" : r.mode === "SIMULATED" ? "SIMULATED" : r.mode}</Badge> {fmtDateTime(r.startedAt)} · <strong>{r.status}</strong>
                  {s ? <span className="text-steel"> · hazır {s.ready}/{s.candidates} · iletilen {s.sent.length} · değişmeyen {s.skippedUnchanged.length} · silinen {s.deleted.length} · hata {s.errors.length}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Notice>
        <strong>Plan (uygulanmadı):</strong> 1) Neon parolası yenilenir. 2) Müşteri, Merchant hesabında yalnız okuma yetkili servis hesabı ekler. 3) Salt-okunur keşif: hesap, veri kaynakları ve mevcut item_id listesi (accounts/dataSources.list, products.list). 4) Ayrı bir API veri kaynağına staging ile test. 5) Aynı offerId’lerle canlıya geçiş, eski kaynak silinmeden. Search Console ve GA4 için de yalnız plan vardır; hiçbir hesaba bağlanılmadı.
      </Notice>
    </>
  );
}
