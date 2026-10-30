import { ActionForm, FormMessage, Input, SubmitButton } from "@/components/admin/forms";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { Card, ModuleState } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { TextArea, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { GROUP_LABELS, SETTING_DEFS, SETTING_KEYS, type SettingDef } from "@/lib/cms/settings";
import { commerceGate } from "@/lib/commerce/gate";
import { requireDb } from "@/lib/db";
import { saveSettingAction, verifySettingAction } from "./actions";

export const metadata = { title: "Ayarlar" };
const PUBLIC_LABEL = { always: "Vitrinde gösterilir (eski sitede yayınlanmış bilgi)", verified: "Yalnız doğrulanınca vitrinde", never: "Asla vitrinde gösterilmez" } as const;

export default async function SettingsPage() {
  const user = await requireAdmin("settings");
  const db = requireDb();
  const [rows, expiredQuotes, outbox] = await Promise.all([db.siteSetting.findMany(), db.quoteRequest.count({ where: { isTest: false, retainUntil: { lt: new Date() } } }), db.notificationOutbox.groupBy({ by: ["status"], _count: true })]);
  const canEdit = allowed(user.role, "settings.edit");
  const canVerify = allowed(user.role, "settings.verify");
  const gate = commerceGate();
  const groups = [...new Set(SETTING_KEYS.map((k) => (SETTING_DEFS[k] as SettingDef).group))];

  return (
    <>
      <PageHeader title="Ayarlar" description="Firma, iletişim ve ticari bilgiler tek kaynaktan yönetilir. Doğrulanmamış firma/ticari bilgiler vitrinde gerçekmiş gibi gösterilmez." actions={<ModuleState state="partial" title="Ayarlar işlevsel; entegrasyonlar bloke" />} />
      {groups.map((g) => (
        <Card key={g} title={GROUP_LABELS[g]} className="mb-6">
          <ul className="divide-y divide-line">
            {SETTING_KEYS.filter((k) => (SETTING_DEFS[k] as SettingDef).group === g).map((k) => {
              const def = SETTING_DEFS[k] as SettingDef;
              const row = rows.find((r) => r.key === k);
              const value = row ? String(row.value ?? "") : "";
              const secret = def.publicWhen === "never" && k === "commerce.bankAccounts";
              return (
                <li key={k} className="grid gap-4 py-5 lg:grid-cols-[1fr_20rem]">
                  <ActionForm action={saveSettingAction} className="space-y-2" aria-label={def.label}>
                    <input type="hidden" name="key" value={k} />
                    {def.kind === "textarea" ? <TextArea name="value" label={def.label} defaultValue={value} rows={3} hint={def.hint} disabled={!canEdit} /> : <TextField name="value" label={def.label} defaultValue={value} type={def.kind === "number" ? "text" : def.kind} hint={def.hint} disabled={!canEdit} autoComplete="off" />}
                    <p className="text-xs text-steel">{PUBLIC_LABEL[def.publicWhen]}{secret ? " · görüntüleme yetkili kullanıcılarla sınırlı" : ""}</p>
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <SubmitButton size="sm" variant="secondary">
                          Kaydet
                        </SubmitButton>
                        <FormMessage />
                      </div>
                    ) : null}
                  </ActionForm>
                  <div className="space-y-2 rounded-[var(--radius-md)] bg-surface-2 p-3 text-xs">
                    <p className="flex flex-wrap items-center gap-2">
                      {row?.status === "VERIFIED" ? <Badge tone="success">Doğrulandı</Badge> : value ? <Badge tone="warning">Doğrulanmadı</Badge> : <Badge tone="outline">Boş</Badge>}
                      {row ? <span className="text-steel">{fmtDateTime(row.updatedAt)}</span> : null}
                    </p>
                    {row?.source ? <p className="text-steel">Kaynak: {row.source}</p> : null}
                    {canVerify && value ? (
                      <ActionForm action={verifySettingAction} className="space-y-2" aria-label={`${def.label} doğrulama`}>
                        <input type="hidden" name="key" value={k} />
                        <input type="hidden" name="verified" value={row?.status === "VERIFIED" ? "false" : "true"} />
                        {row?.status !== "VERIFIED" ? <Input name="source" label="Doğrulama kaynağı" placeholder="Müşteri e-postası, tarih" /> : null}
                        <SubmitButton size="sm" variant={row?.status === "VERIFIED" ? "outline" : "primary"}>
                          {row?.status === "VERIFIED" ? "Doğrulamayı kaldır" : "Doğrula"}
                        </SubmitButton>
                        <FormMessage />
                      </ActionForm>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Online satış / ödeme kapısı" description="Panelden açılamaz. Sunucu ortam ayarlarıyla ve aşağıdaki tüm koşullar sağlanınca açılır; her istekte sunucuda yeniden denetlenir.">
          <p className={`mb-3 text-sm font-bold ${gate.enabled ? "text-success" : "text-signal"}`}>{gate.enabled ? "AÇIK" : "KAPALI"}</p>
          <ul className="list-disc space-y-1 ps-5 text-sm text-steel">
            {gate.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Card>
        <Card title="Entegrasyonlar" description="Hesap/anahtar olmadan hiçbiri 'aktif' gösterilmez.">
          <ul className="space-y-2 text-sm">
            {[
              ["E-posta / SMS bildirimi", "Sağlayıcı yok — bildirimler kuyrukta 'bekliyor'"],
              ["Ödeme sağlayıcısı", "Seçilmedi"],
              ["Google Merchant Center", "Bağlı değil (Sprint 9)"],
              ["Search Console / GA4 / Ads", "Bağlı değil (Sprint 8+)"],
            ].map(([k, v]) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink">{k}</span>
                <Badge tone="outline">{v}</Badge>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Bekleyen bildirim" value={outbox.find((o) => o.status === "BLOCKED")?._count ?? 0} hint="sağlayıcı yok" />
            <StatCard label="Gönderilen" value={outbox.find((o) => o.status === "SENT")?._count ?? 0} />
          </div>
        </Card>
        <Card title="Teklif saklama politikası (taslak)" className="xl:col-span-2">
          <Notice tone="warning" className="mb-3">
            Hukuki saklama süresi onaylanmadı. Otomatik silme veya anonimleştirme ÇALIŞMAZ ve panelde böyle bir düğme yoktur. Onaydan sonra: süresi dolan taleplerde ad, firma, e-posta, telefon ve not alanları silinip referans, tarih, ürün satırları ve durum geçmişi istatistik için korunacak.
          </Notice>
          <p className="text-sm">
            Taslak süre: <strong>{String(rows.find((r) => r.key === "operations.quoteRetentionDays")?.value ?? SETTING_DEFS["operations.quoteRetentionDays"].seed)} gün</strong> · Süresi dolmuş talep: <strong>{expiredQuotes}</strong>
          </p>
        </Card>
      </div>
    </>
  );
}
