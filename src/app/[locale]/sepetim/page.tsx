import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CartView } from "@/components/shop/CartView";
import { CheckoutSteps } from "@/components/shop/CheckoutSteps";
import { catalog } from "@/lib/catalog";
import { ENABLED_LOCALES } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

/** Legacy path /sepetim kept. Prices are computed on the server; checkout opens only when the commerce gate is open. */
export function generateStaticParams() {
  return ENABLED_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/sepetim">) {
  const { locale, d } = getI18n((await params).locale);
  return buildMetadata({ title: d.shop.cart.title, description: d.shop.cart.lead, path: "/sepetim", locale, noindex: true, alternates: false });
}

export default async function CartPage({ params }: PageProps<"/[locale]/sepetim">) {
  const { locale, d, href } = getI18n((await params).locale);
  const all = (await catalog.listCategories(locale)).find((c) => c.isAllProducts);
  return (
    <div className="container-site py-8 md:py-12">
      <Breadcrumbs items={[{ name: d.nav.home, path: href("/") }, { name: d.shop.cart.title, path: href("/sepetim") }]} label={d.a11y.breadcrumb} />
      <header className="mt-6 mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-h1 font-bold text-ink">{d.shop.cart.title}</h1>
          <p className="mt-2 text-steel">{d.shop.cart.lead}</p>
        </div>
        <CheckoutSteps steps={d.shop.checkout.steps} current={0} label={d.shop.checkout.title} />
      </header>
      <CartView locale={locale} labels={d.shop.cart} list={d.quoteList} checkoutHref={href("/odeme")} quoteHref={href("/teklif-listem")} browseHref={all ? href(`/kategori/${all.slug}`) : href("/")} />
    </div>
  );
}
