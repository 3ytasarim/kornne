import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { OrderStatusView } from "@/components/shop/OrderStatusView";
import { SelfServicePage } from "@/components/shop/SelfServicePage";
import { staticAlternates } from "@/lib/i18n/alternates";
import { ENABLED_LOCALES } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

/** Legacy path /siparisim-ne-durumda (kept 1:1). Personal lookup → noindex. */
export function generateStaticParams() {
  return ENABLED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/siparisim-ne-durumda">) {
  const { locale, d } = getI18n((await params).locale);
  return buildMetadata({ title: d.shop.status.title, description: d.shop.status.lead, path: "/siparisim-ne-durumda", locale, noindex: true, alternates: false });
}

export default async function OrderStatusPage({ params }: PageProps<"/[locale]/siparisim-ne-durumda">) {
  const localeParam = (await params).locale;
  const { locale, d, href } = getI18n(localeParam);
  return (
    <>
      <PageLanguageLinks links={staticAlternates("/siparisim-ne-durumda")} />
      <SelfServicePage localeParam={localeParam} current="status" title={d.shop.status.title} lead={d.shop.status.lead}>
        <OrderStatusView locale={locale} s={d.shop} noticeHref={href("/odeme-bildirimi")} />
      </SelfServicePage>
    </>
  );
}
