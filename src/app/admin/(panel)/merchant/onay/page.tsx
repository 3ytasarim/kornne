import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { MERCHANT_NAV } from "@/components/admin/subnavs";
import { ActionForm, Check, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { Card, FilterBar, FilterSearch, FilterSelect, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { strParam } from "@/lib/admin/format";
import { allowed } from "@/lib/auth/rbac";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { toDecimalString } from "@/lib/money";
import { evaluateCatalog } from "@/lib/merchant/facts";
import { GLOBAL_REASONS, REASON_LABEL } from "@/lib/merchant/labels";
import { GOOGLE_REQUIRED } from "@/lib/merchant/readiness";
import { AVAILABILITY_CHOICES, AVAILABILITY_LABEL } from "@/lib/merchant/review";
import { merchantReviewAction } from "../actions";
import { SelectAll } from "./SelectAll";

export const metadata = { title: "Merchant — toplu inceleme ve onay" };
export const dynamic = "force-dynamic";

const FORM_ID = "merchant-review";
const DATA_CODES = new Set(["AVAILABILITY_UNKNOWN", "LEAD_TIME_UNKNOWN", "BRAND_UNVERIFIED", "IDENTIFIER_MISSING"]);

/**
 * Admin › Merchant › Toplu inceleme ve onay: every product's missing Merchant data on one screen. The approver selects
 * rows, enters the REAL values (stock state, lead time, brand, MPN) and confirms them with a source note. Nothing is
 * pre-filled with a guess and nothing is sent to Google.
 */
export default async function MerchantReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAdmin("merchant");
  const sp = await searchParams;
  const q = strParam(sp.q).trim().toLowerCase();
  const only = strParam(sp.eksik);
  const db = requireDb();
  const { ctx, candidates, held, ready } = await evaluateCatalog(db);
  const all = [...candidates, ...held.filter((h) => !candidates.includes(h))];
  const brands = await db.brand.findMany({ select: { id: true, name: true, status: true } });
  const editable = allowed(user.role, "merchant.approve");
  const missing = (code: string) => all.filter((e) => e.reasons.some((r) => r.code === code)).length;
  const rows = all.filter((e) => (!q || `${e.ref} ${e.title ?? ""}`.toLowerCase().includes(q)) && (!only || e.reasons.some((r) => r.code === only)));
  const globals = [...new Set(all.flatMap((e) => e.reasons.filter((r) => r.severity === "blocking" && GLOBAL_REASONS.has(r.code)).map((r) => r.code)))];

  return (
    <>
      <PageHeader title="Merchant — toplu inceleme ve onay" description="Eksik Merchant bilgilerini tek ekranda inceleyin ve gerçek değerleri yetkili onayıyla kaydedin. Boş bırakılan alan değişmez; hiçbir değer tahminle doldurulmaz." />
      <SubNav items={MERCHANT_NAV} current="/admin/merchant/onay" />
      <Notice tone="warning" className="mb-6">
        <strong>Uydurma veri girmeyin.</strong> Stok, temin süresi, marka ve MPN üreticinin/işletmenin gerçek bilgisi olmalı; Google bunları açılış sayfasıyla karşılaştırır ve tutarsızlıkta hesabı askıya alabilir. Barkod (GTIN) burada üretilmez. Kayıtlar denetim kaydına kaynak notuyla yazılır. Google’a hiçbir veri gönderilmez.
      </Notice>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="READY" value={`${ready.length} / ${all.length}`} tone={ready.length ? "success" : "warning"} />
        <StatCard label="Stok bilinmiyor" value={missing("AVAILABILITY_UNKNOWN")} tone={missing("AVAILABILITY_UNKNOWN") ? "warning" : "success"} />
        <StatCard label="Temin süresi yok" value={missing("LEAD_TIME_UNKNOWN")} hint="Siparişe üretilen ürünler" tone={missing("LEAD_TIME_UNKNOWN") ? "warning" : "success"} />
        <StatCard label="Marka teyitsiz" value={missing("BRAND_UNVERIFIED")} tone={missing("BRAND_UNVERIFIED") ? "warning" : "success"} />
        <StatCard label="MPN / tanımlayıcı yok" value={missing("IDENTIFIER_MISSING")} tone={missing("IDENTIFIER_MISSING") ? "warning" : "success"} />
      </div>
      {globals.length ? (
        <Notice tone="info" className="mb-6">
          Bu ekran ürün verisini düzeltir. Şu <strong>genel engeller</strong> ayrıca kalkmadan hiçbir ürün READY olmaz: {globals.map((c) => REASON_LABEL[c] ?? c).join(" · ")}. Ayrıntı: <Link href="/admin/merchant" className="underline">Hazırlık panosu</Link>.
        </Notice>
      ) : null}
      <FilterBar action="/admin/merchant/onay" resetHref="/admin/merchant/onay">
        <FilterSearch value={strParam(sp.q)} placeholder="Ürün adı veya no" />
        <FilterSelect name="eksik" label="Eksik" value={only} options={[["", "Tümü"], ...[...DATA_CODES].map((c) => [c, `${REASON_LABEL[c] ?? c} (${missing(c)})`] as [string, string])]} />
      </FilterBar>

      <ActionForm action={merchantReviewAction} id={FORM_ID} className="space-y-6" aria-label="Toplu Merchant onayı">
        <Card title="1 · Seçili ürünlere uygulanacak değerler" description={`Hedef: ${ctx.targetCountry ?? "teyitsiz"} · ${ctx.currency}. Boş bırakılan alan değişmez.`}>
          <div className="grid gap-4 md:grid-cols-3">
            <Select name="availability" label="Stok / temin durumu" defaultValue="" disabled={!editable}>
              <option value="">— değiştirme —</option>
              {AVAILABILITY_CHOICES.map((a) => (
                <option key={a} value={a}>
                  {AVAILABILITY_LABEL[a]}
                </option>
              ))}
            </Select>
            <Input name="leadTimeDays" label="Temin süresi (iş günü)" hint="Sipariş → sevke hazır. Siparişe üretimde zorunlu; Google’a max_handling_time olarak gider." type="number" min={1} max={365} inputMode="numeric" disabled={!editable} />
            <Input name="brand" label="Marka" hint={brands.length ? `Kayıtlı: ${brands.map((b) => `${b.name}${b.status === "VERIFIED" ? " ✓" : ""}`).join(", ")}` : "Ürünü kim üretiyorsa onun markası (ör. kendi üretiminizse KORNNE)"} maxLength={70} disabled={!editable} />
          </div>
          <div className="mt-4">
            <Check name="identifierNone" label="Bu ürünlerin barkodu (GTIN) ve üretici parça numarası (MPN) YOK" hint="Yalnız GTIN/MPN’si olmayan seçili ürünlere identifier_exists=no yazılır. Aşağıda MPN girdiğiniz ürünler MPN ile gider." disabled={!editable} />
          </div>
        </Card>

        <Card title="2 · Ürünleri seçin, varsa MPN girin" description={`${rows.length} ürün listeleniyor.`}>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Kaydırılabilir ürün tablosu">
            <table className="w-full min-w-[64rem] text-sm">
              <caption className="sr-only">Merchant verisi eksik ürünler</caption>
              <thead className="bg-surface-2 text-xs text-steel uppercase">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start">{editable ? <SelectAll form={FORM_ID} /> : <span className="sr-only">Seç</span>}</th>
                  <th scope="col" className="px-3 py-2 text-start">Ürün</th>
                  <th scope="col" className="px-3 py-2 text-start">Fiyat</th>
                  <th scope="col" className="px-3 py-2 text-start">Stok · temin</th>
                  <th scope="col" className="px-3 py-2 text-start">Marka</th>
                  <th scope="col" className="px-3 py-2 text-start">MPN (üretici kodu)</th>
                  <th scope="col" className="px-3 py-2 text-start">Ürüne özel engeller</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const own = e.reasons.filter((r) => r.severity === "blocking" && !GLOBAL_REASONS.has(r.code));
                  return (
                    <tr key={e.id} className="border-t border-line align-top">
                      <td className="px-3 py-2">
                        <input type="checkbox" name="productId" value={e.id} aria-label={`Seç: ${e.title ?? e.ref}`} className="size-5 accent-brand-700" disabled={!editable} />
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/admin/products/${e.id}`} className="font-medium text-ink underline">
                          {e.title ?? e.id}
                        </Link>
                        <span className="block text-xs text-steel">#{e.ref}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {e.price ? (
                          <>
                            {toDecimalString(e.price.amountMinor)} {e.price.currency} {e.price.status === "VERIFIED" ? <Badge tone="success">onaylı</Badge> : <Badge tone="warning">onaysız</Badge>}
                            {e.price.converted ? <span className="block text-steel">TL’den kurla çevrildi</span> : null}
                          </>
                        ) : (
                          <Badge tone="warning">yok</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {e.availability && e.availability !== "UNKNOWN" ? AVAILABILITY_LABEL[e.availability as keyof typeof AVAILABILITY_LABEL] : <Badge tone="warning">bilinmiyor</Badge>}
                        {e.leadTimeDays ? <span className="block text-steel">{e.leadTimeDays} gün</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">{e.brandName ?? <Badge tone="warning">teyitsiz</Badge>}</td>
                      <td className="px-3 py-2">
                        <input
                          name={`mpn:${e.id}`}
                          defaultValue={e.mpn ?? ""}
                          maxLength={70}
                          aria-label={`MPN: ${e.title ?? e.ref}`}
                          placeholder={e.identifierExists === false ? "tanımlayıcı yok" : "—"}
                          disabled={!editable}
                          className="min-h-11 w-40 rounded-md border border-line bg-surface px-2 font-mono text-xs"
                        />
                        {e.gtin ? <span className="block text-xs text-steel">GTIN {e.gtin}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <ul className="space-y-0.5">
                          {own.map((r) => (
                            <li key={r.code}>
                              {REASON_LABEL[r.code] ?? r.code} <span className="text-steel">· {GOOGLE_REQUIRED.has(r.code) ? "Google" : "iç kural"}</span>
                            </li>
                          ))}
                          {!own.length ? <li className="text-steel">Ürün verisi tamam</li> : null}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {editable ? (
          <Card title="3 · Onay">
            <div className="space-y-3">
              <Input name="note" label="Kaynak / dayanak" hint="Bilgiyi kim, ne zaman verdi? (ör. “Üretim müdürü teyidi, 13.11.2026”). Denetim kaydına yazılır." required minLength={5} maxLength={500} />
              <Check name="confirm" label="Girdiğim bilgilerin gerçek ve güncel olduğunu, yetkili olarak onaylıyorum." />
              <FormMessage />
              <SubmitButton pendingText="Kaydediliyor…">Seçili ürünlere kaydet</SubmitButton>
            </div>
          </Card>
        ) : (
          <Notice>Bu ekranda kayıt yapma yetkiniz yok (Süper Yönetici veya Yönetici gerekir).</Notice>
        )}
      </ActionForm>
    </>
  );
}
