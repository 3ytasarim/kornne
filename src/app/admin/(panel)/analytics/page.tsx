import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { Card, KeyValues, ModuleState } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { analyticsConfig, siteVerificationToken } from "@/lib/analytics/config";
import { CONSENT_COOKIE, CONSENT_MAX_AGE_DAYS, CONSENT_VERSION } from "@/lib/analytics/consent";
import { EVENTS, FORBIDDEN_EVENTS } from "@/lib/analytics/events";
import { requireAdmin } from "@/lib/auth/guard";
import { isIndexable } from "@/lib/seo/site";

export const metadata = { title: "Analitik & izin" };
export const dynamic = "force-dynamic";

const TRIGGER: Record<string, string> = {
  page_view: "Her sayfa ve istemci gezintisi (izin sonrası)",
  view_item: "Ürün sayfası açıldı",
  view_item_list: "Kategori listesi açıldı",
  select_item: "Liste / ilgili ürün kartına tıklandı",
  search: "Site içi arama sonuç sayfası (terim kişisel veri gibi görünüyorsa gönderilmez)",
  add_to_quote_list: "Ürün teklif listesine eklendi",
  generate_lead: "Teklif talebi KAYDEDİLDİ (referans oluştu) — referans başına bir kez",
  whatsapp_click: "WhatsApp bağlantısı (yalnız konum; mesaj metni gönderilmez)",
  contact_click: "tel: / mailto: bağlantısı (yalnız yöntem; numara/adres gönderilmez)",
};

/**
 * Admin › Analitik & izin (Sprint 10): HONEST configuration status. Shows what the environment enables — never a
 * "connected" state that was not observed, and no visitor numbers (there is no data source in this app).
 */
export default async function AnalyticsPage() {
  await requireAdmin("settings");
  const c = analyticsConfig();
  const gsc = siteVerificationToken();
  return (
    <>
      <PageHeader title="Analitik, Tag Manager ve Search Console" description="Ölçüm altyapısı hazır; Google hesaplarına bağlantı müşterinin mevcut hesaplarıyla, onaydan sonra kurulur. Bu ekran ziyaretçi sayısı göstermez: veriler Google tarafında tutulur ve burada sentetik metrik üretilmez." actions={<ModuleState state={c.enabled ? "partial" : "prep"} title={c.enabled ? "Yapılandırıldı — veri akışı doğrulanmadı" : "BAĞLI DEĞİL"} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Analitik" value={c.enabled ? (c.mode === "gtm" ? "Tag Manager" : "GA4 (gtag)") : "Kapalı"} tone={c.enabled ? "warning" : "neutral"} hint={c.enabled ? "DebugView ile doğrulanmalı" : "ANALYTICS_ENABLED kapalı"} />
        <StatCard label="Search Console doğrulama etiketi" value={gsc ? "Tanımlı" : "Yok"} hint={gsc ? (isIndexable() ? "Meta etiket yayında" : "Ortam noindex") : "GOOGLE_SITE_VERIFICATION"} />
        <StatCard label="Çerez metni" value={c.legalApproved ? "Onaylı" : "Taslak"} tone={c.legalApproved ? "success" : "warning"} hint="Hukuki onay gerekli" />
        <StatCard label="Ticari olaylar" value="Kapalı" hint="purchase / begin_checkout gönderilmez" />
      </div>
      {c.problems.length ? (
        <Notice tone="warning" className="mb-6">
          {c.problems.join(" · ")}
        </Notice>
      ) : null}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="İzin (Google Consent Mode v2)">
          <KeyValues
            rows={[
              ["Mod", "Temel (basic): seçimden önce Google betiği YÜKLENMEZ; reddedilirse hiç yüklenmez"],
              ["Varsayılan", "analytics_storage, ad_storage, ad_user_data, ad_personalization = denied"],
              ["Kabul sonrası", "default(denied) → update(seçim) → yapılandırma; reklam sinyalleri yalnız “Pazarlama” seçilirse"],
              ["Çerez", `${CONSENT_COOKIE} · sürüm ${CONSENT_VERSION} · ${CONSENT_MAX_AGE_DAYS} gün · SameSite=Lax`],
              ["Tercih değişikliği", "Footer › Çerez tercihleri; geri çekilince _ga çerezleri silinir"],
            ]}
          />
        </Card>
        <Card title="Kişisel veri yasağı">
          <ul className="list-disc space-y-1 ps-5 text-sm">
            <li>Ad, e-posta, telefon, firma, mesaj, teklif referansı, oturum ve token hiçbir olaya girmez.</li>
            <li>E-posta / telefon / referans gibi görünen her değer gönderilmeden atılır (maskeleme değil).</li>
            <li>Sayfa adresi sorgu dizesi olmadan gönderilir (arama terimi URL’den sızmaz).</li>
            <li>Fiyat, değer, para birimi gönderilmez (fiyatlar onaysız).</li>
          </ul>
        </Card>
      </div>
      <Card title="Olay planı (yalnız bunlar gönderilebilir)">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">Olay planı</caption>
            <thead className="text-xs text-steel uppercase">
              <tr>
                <th scope="col" className="py-2 text-start">Olay</th>
                <th scope="col" className="py-2 text-start">Tetikleyici</th>
                <th scope="col" className="py-2 text-start">Parametreler</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(EVENTS).map(([name, params]) => (
                <tr key={name} className="border-t border-line align-top">
                  <td className="py-2 font-mono text-xs">{name}</td>
                  <td className="py-2">{TRIGGER[name]}</td>
                  <td className="py-2 font-mono text-xs">{(params as readonly string[]).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-steel">
          Engelli olaylar: {[...FORBIDDEN_EVENTS].map((e) => <Badge key={e} tone="outline" className="me-1">{e}</Badge>)}
        </p>
      </Card>
    </>
  );
}
