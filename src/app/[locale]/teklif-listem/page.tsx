import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { QuoteListView } from "@/components/quote/QuoteListView";
import { catalog } from "@/lib/catalog";
import { staticAlternates } from "@/lib/i18n/alternates";
import { ENABLED_LOCALES } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

export function generateStaticParams() {
  return ENABLED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/teklif-listem">) {
  const { locale, d } = getI18n((await params).locale);
  // personal working list → never indexed
  return buildMetadata({ title: d.quoteList.title, description: d.quoteList.lead, path: "/teklif-listem", locale, noindex: true, alternates: false });
}

export default async function QuoteListPage({ params }: PageProps<"/[locale]/teklif-listem">) {
  const { locale, d, href } = getI18n((await params).locale);
  const all = (await catalog.listCategories(locale)).find((c) => c.isAllProducts);
  const crumbs = [
    { name: d.nav.home, path: href("/") },
    { name: d.quoteList.title, path: href("/teklif-listem") },
  ];
  return (
    <div className="container-site py-8 md:py-12">
      <PageLanguageLinks links={staticAlternates("/teklif-listem")} />
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />
      <header className="mt-6 mb-8 max-w-3xl">
        <h1 className="font-display text-h1 font-bold text-ink">{d.quoteList.title}</h1>
        <p className="mt-3 text-steel">{d.quoteList.lead}</p>
      </header>
      <QuoteListView
        locale={locale}
        list={d.quoteList}
        form={d.quoteForm}
        // the privacy notice exists only in Turkish (legal approval pending)
        privacyHref="/sayfa/kisisel-verilenin-korunmasi-kanunu"
        browseHref={all ? href(`/kategori/${all.slug}`) : href("/")}
      />
    </div>
  );
}
