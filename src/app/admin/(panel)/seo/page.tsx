import Link from "next/link";
import type { Locale } from "@prisma/client";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { Card, ModuleState, SubNav, Tabs } from "@/components/admin/ui";
import { SEO_NAV } from "@/components/admin/subnavs";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { ActionForm, ConfirmSubmit, FormMessage } from "@/components/admin/forms";
import { fillEmptySeoAction } from "./actions";
import { requireAdmin } from "@/lib/auth/guard";
import { CATALOG_DATA_VERIFIED } from "@/lib/catalog";
import { requireDb } from "@/lib/db";
import { LOCALE_META, LOCALES } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { getSiteUrl, isIndexable, seoLocales } from "@/lib/seo/site";

export const metadata = { title: "SEO / GEO" };
const PUBLIC_T = new Set(["LEGACY_SOURCE", "APPROVED"]);
type Row = { type: string; name: string; path: string; title: string | null; fallbackTitle: string; desc: string | null; hreflang: string[]; noindexReason: string | null; edit: string };

function warnings(r: Row, dupTitles: Set<string>) {
  const out: string[] = [];
  const t = r.title ?? r.fallbackTitle;
  if (!r.title) out.push("SEO başlığı yok (ad kullanılıyor)");
  else if (r.title.length > 60) out.push("başlık > 60");
  else if (r.title.length < 30) out.push("başlık < 30");
  if (!r.desc) out.push("açıklama yok");
  else if (r.desc.length > 160) out.push("açıklama > 160");
  else if (r.desc.length < 70) out.push("açıklama < 70");
  if (dupTitles.has(t)) out.push("yinelenen başlık");
  return out;
}

/**
 * SEO/GEO overview per language. Fields are edited where the content lives (product / category / content editors);
 * this screen shows canonical, hreflang (ONLY published translations), indexability and quality warnings.
 */
export default async function SeoPage({ searchParams }: PageProps<"/admin/seo">) {
  await requireAdmin("seo");
  const sp = await searchParams;
  const locale = (LOCALES.includes(sp.dil as Locale) ? sp.dil : "tr") as Locale;
  const db = requireDb();
  const [products, categories, pages, faq] = await Promise.all([
    db.product.findMany({ where: { status: "PUBLISHED", needsReview: false }, orderBy: { sortOrder: "asc" }, select: { id: true, translations: { select: { locale: true, status: true, title: true, slug: true, seoTitle: true, seoDescription: true } } } }),
    db.category.findMany({ where: { status: "PUBLISHED" }, select: { id: true, translations: true } }),
    db.pageTranslation.findMany({ where: { state: "PUBLISHED" }, select: { locale: true, publishedSlug: true, title: true, seoTitle: true, seoDescription: true, bodyHtml: true, page: { select: { id: true, kind: true, key: true, legalApprovedAt: true } } } }),
    db.faqItem.count({ where: { state: "PUBLISHED", locale } }),
  ]);
  const rows: Row[] = [];
  for (const p of products) {
    const t = p.translations.find((x) => x.locale === locale && PUBLIC_T.has(x.status));
    if (!t) continue;
    rows.push({ type: "Ürün", name: t.title, path: localizePath(locale, `/urun/${t.slug}`), title: t.seoTitle, fallbackTitle: t.title, desc: t.seoDescription, hreflang: p.translations.filter((x) => PUBLIC_T.has(x.status)).map((x) => x.locale), noindexReason: null, edit: `/admin/products/${p.id}?tab=${locale === "tr" ? "icerik" : "diller"}` });
  }
  for (const c of categories) {
    const t = c.translations.find((x) => x.locale === locale);
    if (!t) continue;
    rows.push({ type: "Kategori", name: t.name, path: localizePath(locale, `/kategori/${t.slug}`), title: t.seoTitle, fallbackTitle: t.name, desc: t.seoDescription, hreflang: c.translations.filter((x) => PUBLIC_T.has(x.status)).map((x) => x.locale), noindexReason: PUBLIC_T.has(t.status) ? null : "kategori adı çevirisi onaylı değil", edit: `/admin/categories/${c.id}` });
  }
  for (const t of pages.filter((x) => x.locale === locale)) {
    const siblings = pages.filter((x) => x.page.id === t.page.id);
    rows.push({
      type: t.page.kind === "BLOG" ? "Blog" : t.page.kind === "LEGAL" ? "Yasal" : "Sayfa",
      name: t.title,
      path: localizePath(locale, `/${t.page.kind === "BLOG" ? "blog" : "sayfa"}/${t.publishedSlug}`),
      title: t.seoTitle,
      fallbackTitle: t.title,
      desc: t.seoDescription,
      hreflang: t.page.kind === "LEGAL" ? [] : siblings.filter((x) => x.bodyHtml.trim()).map((x) => x.locale),
      noindexReason: t.page.kind === "LEGAL" && !t.page.legalApprovedAt ? "yasal onay yok" : !t.bodyHtml.trim() ? "bu dilde metin yok (TR gösteriliyor)" : null,
      edit: `/admin/content/${t.page.id}?dil=${locale}`,
    });
  }
  // Sprint 8 policy: only SEO locales are indexable; hreflang only between them
  const seo = seoLocales();
  for (const r of rows) {
    r.hreflang = r.hreflang.filter((l) => seo.includes(l as Locale));
    if (!seo.includes(locale) && !r.noindexReason) r.noindexReason = "dil SEO_LOCALES dışında (çeviri onayı bekleniyor)";
  }
  const titles = rows.map((r) => r.title ?? r.fallbackTitle);
  const dup = new Set(titles.filter((t, i) => titles.indexOf(t) !== i));
  const withWarn = rows.filter((r) => warnings(r, dup).length).length;
  const indexable = isIndexable();
  const emptyProducts = await db.productTranslation.count({ where: { OR: [{ seoTitle: null }, { seoTitle: "" }, { seoDescription: null }, { seoDescription: "" }], product: { status: { not: "ARCHIVED" } } } });
  return (
    <>
      <PageHeader title="SEO / GEO" description="Her dil için başlık, açıklama, kanonik adres ve hreflang. hreflang yalnız gerçekten yayımlanmış çevirileri gösterir; taslak veya olmayan çeviriye bağlantı üretilmez." actions={<ModuleState state="partial" title="Alan düzenleme + rapor; Search Console/GA4 yalnız plan (bağlantı yok)" />} />
      <SubNav items={SEO_NAV} current="/admin/seo" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="İndekslenebilir mi?" value={indexable ? "Evet" : "Hayır"} tone={indexable ? "success" : "warning"} hint={indexable ? "" : "Önizleme ortamı: noindex (bilerek)"} />
        <StatCard label="Sitemap" value={indexable && CATALOG_DATA_VERIFIED ? "Dolu" : "Boş"} hint="Veri doğrulanıp yayına geçince dolar" />
        <StatCard label={`${locale.toUpperCase()} sayfa`} value={rows.length} />
        <StatCard label="Uyarılı" value={withWarn} tone={withWarn ? "warning" : "success"} />
      </div>
      {emptyProducts ? (
        <Card className="mb-6" title={`${emptyProducts} ürün metninde SEO başlığı veya açıklaması boş`} description="Tek tıkla doldurun: başlık = ürün adı + kategori, açıklama = ürün açıklamasının ilk cümleleri (Google sınırlarına göre kısaltılır). Yalnız BOŞ alanlar yazılır; elle girdikleriniz değişmez. Sonra her ürünü tek tek düzenleyebilirsiniz.">
          <ActionForm action={fillEmptySeoAction} className="flex flex-wrap items-center gap-3">
            <ConfirmSubmit variant="primary" size="md" confirmText="Evet, boş alanları doldur">
              Boş SEO alanlarını otomatik doldur
            </ConfirmSubmit>
            <FormMessage />
          </ActionForm>
        </Card>
      ) : null}
      <Notice className="mb-6">
        JSON-LD: Ürün sayfalarında <code>Offer</code> yalnız doğrulanmış fiyatla, <code>AggregateRating</code>/<code>Review</code> hiç üretilmez (yorum yok). FAQPage verisi yalnız yayındaki SSS’den ({faq} soru, {locale.toUpperCase()}). Site URL: {getSiteUrl()}
      </Notice>
      <Tabs label="Dil" current={locale} items={LOCALES.map((l) => ({ key: l, label: LOCALE_META[l].nativeName, href: `/admin/seo?dil=${l}` }))} />
      <Card>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
          <table className="w-full min-w-[60rem] text-sm">
            <caption className="sr-only">SEO alanları</caption>
            <thead className="bg-surface-2 text-xs text-steel uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 text-start">Tür</th>
                <th scope="col" className="px-3 py-2 text-start">Sayfa / kanonik</th>
                <th scope="col" className="px-3 py-2 text-start">SEO başlığı</th>
                <th scope="col" className="px-3 py-2 text-start">hreflang</th>
                <th scope="col" className="px-3 py-2 text-start">İndeks</th>
                <th scope="col" className="px-3 py-2 text-start">Uyarı</th>
                <th scope="col" className="px-3 py-2 text-start">
                  <span className="sr-only">Düzenle</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-steel">
                    Bu dilde yayında sayfa yok (ürün çevirisi onaylanmadı / kaynakta yok).
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const w = warnings(r, dup);
                  return (
                    <tr key={r.path} className="border-t border-line align-top">
                      <td className="px-3 py-2 text-xs">{r.type}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-ink">{r.name}</span>
                        <code className="block text-[11px] text-steel">{r.path}</code>
                      </td>
                      <td className="px-3 py-2 text-xs">{r.title ?? <span className="text-steel">({r.fallbackTitle})</span>}</td>
                      <td className="px-3 py-2 text-xs">{r.hreflang.length > 1 ? `${r.hreflang.join(", ")} + x-default` : <span className="text-steel">yok (tek dil)</span>}</td>
                      <td className="px-3 py-2 text-xs">{!indexable ? <Badge tone="outline">noindex (ortam)</Badge> : r.noindexReason ? <Badge tone="warning">noindex: {r.noindexReason}</Badge> : <Badge tone="success">index</Badge>}</td>
                      <td className="px-3 py-2 text-xs">{w.length ? <span className="text-warning">{w.join(" · ")}</span> : <span className="text-success">—</span>}</td>
                      <td className="px-3 py-2">
                        <Link href={r.edit} className="text-xs font-semibold text-brand-700 underline dark:text-brand-300">
                          Düzenle
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
