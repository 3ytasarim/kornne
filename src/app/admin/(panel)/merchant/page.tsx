import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { MERCHANT_NAV } from "@/components/admin/subnavs";
import { Card, FilterBar, FilterSelect, ModuleState, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { strParam } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { LOCALE_META, LOCALES } from "@/lib/i18n/config";
import { evaluateCatalog } from "@/lib/merchant/facts";
import { fixHref, GLOBAL_REASONS, REASON_LABEL } from "@/lib/merchant/labels";

export const metadata = { title: "Merchant Center" };
export const dynamic = "force-dynamic";

/**
 * Admin › Merchant Center (Sprint 9): readiness of every storefront product with REAL data and reason codes.
 * Honest status: the API is NOT connected and nothing has been sent to Google; the existing account is untouched.
 */
export default async function MerchantPage({ searchParams }: PageProps<"/admin/merchant">) {
  await requireAdmin("merchant");
  const reason = strParam((await searchParams).neden);
  const db = requireDb();
  const { ctx, candidates, held, ready, byReason } = await evaluateCatalog(db);
  const [lastRun, translations, mappings] = await Promise.all([
    db.merchantSyncRun.findFirst({ where: { mode: { in: ["SIMULATED", "MOCK", "LIVE"] } }, orderBy: { startedAt: "desc" }, select: { startedAt: true, mode: true, status: true } }),
    db.productTranslation.groupBy({ by: ["locale"], where: { status: { in: ["LEGACY_SOURCE", "APPROVED"] }, product: { status: "PUBLISHED", needsReview: false } }, _count: true }),
    db.merchantItemMapping.groupBy({ by: ["contentLanguage", "feedLabel"], _count: true }),
  ]);
  const globalCodes = GLOBAL_REASONS;
  const rows = candidates.filter((e) => !reason || e.reasons.some((r) => r.code === reason));
  const sortedReasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader title="Google Merchant Center — kontrol merkezi" description="Ürün uygunluğu gerçek verilerle hesaplanır: onaylı fiyat, gerçek stok, yayımlanmış çeviri, indekslenebilir açılış sayfası, görsel, tanımlayıcılar, kargo/iade ve işletme kimliği. Uydurma değer (0 TL, “stokta”, rastgele barkod) asla kullanılmaz." actions={<ModuleState state="partial" title="Motor + önizleme çalışıyor; API bağlı değil" />} />
      <SubNav items={MERCHANT_NAV} current="/admin/merchant" />
      <Notice tone="warning" className="mb-6">
        <strong>BAĞLI DEĞİL · GÖNDERİLMEDİ.</strong> Merchant API bağlantısı kapalı (varsayılan). Mevcut Merchant Center hesabına, feed’e ve kampanyalara dokunulmadı; Google’a hiçbir veri gönderilmedi. Content API for Shopping kullanılmıyor (18 Ağustos 2026’da kapandı).
      </Notice>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Feed adayı (vitrin ürünü)" value={candidates.length} hint={`${held.length} ürün incelemede (ör. #208)`} />
        <StatCard label="READY" value={`${ready.length} / ${candidates.length}`} tone={ready.length ? "success" : "warning"} />
        <StatCard label="BLOCKED" value={candidates.length - ready.length} tone="warning" />
        <StatCard label="Hedef" value={ctx.targetCountry && ctx.contentLanguage ? `${ctx.targetCountry} · ${ctx.contentLanguage} · ${ctx.feedLabel}` : "teyitsiz"} hint="Admin › Ayarlar › Google Merchant hedefi" tone={ctx.targetCountry ? "neutral" : "warning"} />
        <StatCard label="Son kuru çalıştırma" value={lastRun ? lastRun.status ?? "—" : "yok"} hint={lastRun ? `${lastRun.mode} · ${lastRun.startedAt.toLocaleString("tr-TR")}` : "API bağlantısı sekmesi"} />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Engel nedenleri (ürün sayısı)" description="Tüm ürünleri etkileyen genel engeller ve ürün bazlı engeller.">
          <ul className="space-y-1 text-sm">
            {sortedReasons.map(([code, n]) => (
              <li key={code} className="flex items-center justify-between gap-3">
                <Link href={`/admin/merchant?neden=${code}`} className="text-brand-700 underline dark:text-brand-300">
                  {REASON_LABEL[code] ?? code} <code className="text-[11px] text-steel">{code}</code>
                </Link>
                <span className="flex items-center gap-2">
                  {globalCodes.has(code) ? <Badge tone="outline">genel</Badge> : null}
                  <strong>{n}</strong>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Ülke / dil kapsamı" description="Yayımlanmış ürün çevirisi ve mevcut hesaptan eşlenmiş item_id sayısı.">
          <table className="w-full text-sm">
            <caption className="sr-only">Dil kapsamı</caption>
            <thead className="text-xs text-steel">
              <tr>
                <th scope="col" className="py-1 text-start">Dil</th>
                <th scope="col" className="py-1 text-end">Yayımlanmış ürün sayfası</th>
                <th scope="col" className="py-1 text-end">Eşlenmiş item_id</th>
              </tr>
            </thead>
            <tbody>
              {LOCALES.map((l) => (
                <tr key={l} className="border-t border-line">
                  <td className="py-1">{LOCALE_META[l].nativeName}</td>
                  <td className="py-1 text-end">{translations.find((t) => t.locale === l)?._count ?? 0}</td>
                  <td className="py-1 text-end">{mappings.filter((m) => m.contentLanguage === l).reduce((a, m) => a + m._count, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <FilterBar action="/admin/merchant" resetHref="/admin/merchant">
        <FilterSelect name="neden" label="Engel" value={reason} options={[["", "Tümü"], ...sortedReasons.map(([c, n]) => [c, `${REASON_LABEL[c] ?? c} (${n})`] as [string, string])]} />
      </FilterBar>
      <Card>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">Ürün bazlı Merchant uygunluğu</caption>
            <thead className="bg-surface-2 text-xs text-steel uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-start">Ürün</th>
                <th scope="col" className="px-3 py-2 text-start">Durum</th>
                <th scope="col" className="px-3 py-2 text-start">Ürüne özgü engeller → düzeltme</th>
                <th scope="col" className="px-3 py-2 text-start">Uyarılar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const own = e.reasons.filter((r) => r.severity === "blocking" && !globalCodes.has(r.code));
                const warn = e.reasons.filter((r) => r.severity === "warning");
                return (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="px-3 py-2">
                      <Link href={`/admin/products/${e.id}`} className="font-medium text-ink underline">
                        {e.title ?? e.id}
                      </Link>
                      <span className="block text-xs text-steel">
                        #{e.ref} · offerId <code>{e.offerId}</code>
                        {e.mappedOfferId ? "" : " (yeni)"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{e.status === "READY" ? <Badge tone="success">READY</Badge> : <Badge tone="warning">BLOCKED</Badge>}</td>
                    <td className="px-3 py-2 text-xs">
                      <ul className="space-y-1">
                        {own.map((r) => (
                          <li key={r.code}>
                            <Link href={fixHref(r, e)} className="text-brand-700 underline dark:text-brand-300">
                              {REASON_LABEL[r.code] ?? r.code}
                            </Link>{" "}
                            <span className="text-steel">— {r.message}</span>
                          </li>
                        ))}
                        {!own.length ? <li className="text-steel">Yalnız genel engeller</li> : null}
                      </ul>
                    </td>
                    <td className="px-3 py-2 text-xs text-steel">{warn.map((r) => REASON_LABEL[r.code] ?? r.code).join(" · ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
