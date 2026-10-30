import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { TRANSLATION_NAV } from "@/components/admin/subnavs";
import { ModuleState, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { coverageReport } from "@/lib/admin/translations";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { missingKeys } from "@/lib/i18n/dictionaries";
import { LOCALE_META } from "@/lib/i18n/config";

export const metadata = { title: "Çeviriler" };

const cell = (n: number, total: number) => (
  <span className={n === total && total > 0 ? "font-semibold text-success" : n === 0 ? "text-steel" : "text-warning"}>
    {n}/{total}
  </span>
);

/** Per-language coverage report: products, categories, CMS pages, menus, SEO meta, alt texts, UI strings. */
export default async function TranslationsPage() {
  await requireAdmin("translations");
  const rows = await coverageReport(requireDb());
  return (
    <>
      <PageHeader title="Çeviriler — dil kapsamı" description="Türkçe kaynak dildir. Bir dilde içerik yoksa sahte sayfa veya hreflang üretilmez; liste sayfaları Türkçe içeriği “Türkçe” etiketiyle gösterir." actions={<ModuleState state="live" />} />
      <SubNav items={TRANSLATION_NAV} current="/admin/translations" />
      <Notice className="mb-6">RU ve AR için kaynakta ürün metni yok; ürün sayfası oluşturulmadı. Arayüz metinleri 5 dilde tam; ana dil kontrolü (native review) bekliyor.</Notice>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
        <table className="w-full min-w-[60rem] text-sm">
          <caption className="sr-only">Dil kapsamı</caption>
          <thead className="bg-surface-2 text-xs text-steel uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 text-start">Dil</th>
              <th scope="col" className="px-4 py-3 text-start">Ürün sayfası (yayında)</th>
              <th scope="col" className="px-4 py-3 text-start">Ürün taslağı</th>
              <th scope="col" className="px-4 py-3 text-start">Ürün SEO</th>
              <th scope="col" className="px-4 py-3 text-start">Kategori</th>
              <th scope="col" className="px-4 py-3 text-start">CMS (yayın/onay/taslak)</th>
              <th scope="col" className="px-4 py-3 text-start">Menü etiketi</th>
              <th scope="col" className="px-4 py-3 text-start">Alt metin (editör/otomatik)</th>
              <th scope="col" className="px-4 py-3 text-start">Arayüz</th>
              <th scope="col" className="px-4 py-3 text-start">Eşleşme</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ui = r.locale === "tr" ? 0 : missingKeys(r.locale).length;
              return (
                <tr key={r.locale} className="border-t border-line">
                  <th scope="row" className="px-4 py-3 text-start font-semibold">
                    {LOCALE_META[r.locale].nativeName}
                  </th>
                  <td className="px-4 py-3">{cell(r.products.published, r.products.total)}</td>
                  <td className="px-4 py-3">{r.products.draft ? <Link href="/admin/products?dil=en" className="text-warning underline">{r.products.draft}</Link> : "0"}</td>
                  <td className="px-4 py-3">{cell(r.products.seo, r.products.total)}</td>
                  <td className="px-4 py-3">{cell(r.categories.present, r.categories.total)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.pages.published}/{r.pages.review}/{r.pages.draft}
                    {r.pages.emptyBody ? <span className="block text-xs text-steel">{r.pages.emptyBody} metinsiz (TR gösterilir)</span> : null}
                  </td>
                  <td className="px-4 py-3">{cell(r.menu.labelled, r.menu.total)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {r.alt.reviewed}/{r.alt.auto}
                  </td>
                  <td className="px-4 py-3">{ui ? <Badge tone="warning">{ui} eksik</Badge> : <Badge tone="success">Tam</Badge>}</td>
                  <td className="px-4 py-3 text-xs">
                    {r.locale === "en" || r.locale === "fr" ? (
                      <Link href={`/admin/translations/matches?dil=${r.locale}`} className="text-brand-700 underline dark:text-brand-300">
                        {r.matches.SUGGESTED ?? 0} bekliyor · {r.matches.APPROVED ?? 0} onay · {r.matches.REJECTED ?? 0} ret
                      </Link>
                    ) : (
                      "kaynak kayıt yok"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
