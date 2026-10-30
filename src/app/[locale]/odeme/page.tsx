import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CommerceLocked } from "@/components/quote/CommerceLocked";
import { CheckoutView } from "@/components/shop/CheckoutView";
import { catalog } from "@/lib/catalog";
import { listPublicBankAccounts } from "@/lib/commerce/bank-accounts";
import { commerceGate } from "@/lib/commerce/gate";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

/** B2B checkout, EFT / Havale only. Locked (quote list instead) until the commerce gate is open. Bank data is live. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/[locale]/odeme">) {
  const { locale, d } = getI18n((await params).locale);
  return buildMetadata({ title: d.shop.checkout.title, description: d.shop.checkout.lead, path: "/odeme", locale, noindex: true, alternates: false });
}

export default async function CheckoutPage({ params }: PageProps<"/[locale]/odeme">) {
  const { locale, d, href } = getI18n((await params).locale);
  const crumbs = [
    { name: d.nav.home, path: href("/") },
    { name: d.shop.cart.title, path: href("/sepetim") },
    { name: d.shop.checkout.title, path: href("/odeme") },
  ];
  if (!commerceGate().enabled) {
    return (
      <div className="container-site py-12 md:py-16">
        <h1 className="mb-8 text-center font-display text-h1 font-bold text-ink">{d.commerce.checkoutTitle}</h1>
        <CommerceLocked title={d.commerce.cartLocked} text={d.commerce.cartLockedText} cta={d.commerce.goToQuote} href={href("/teklif-listem")} />
      </div>
    );
  }
  const db = prisma;
  const [banks, categories] = await Promise.all([db ? listPublicBankAccounts(db).catch(() => []) : [], catalog.listCategories(locale)]);
  const all = categories.find((c) => c.isAllProducts);
  return (
    <div className="container-site py-8 md:py-12">
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />
      <CheckoutView
        locale={locale}
        s={d.shop}
        banks={banks}
        hrefs={{
          cart: href("/sepetim"),
          notice: href("/odeme-bildirimi"),
          status: href("/siparisim-ne-durumda"),
          // legal texts exist only in Turkish (legal approval pending)
          terms: "/sayfa/mesafeli-satis-sozlesmesi",
          privacy: "/sayfa/kisisel-verilenin-korunmasi-kanunu",
          browse: all ? href(`/kategori/${all.slug}`) : href("/"),
        }}
      />
    </div>
  );
}
