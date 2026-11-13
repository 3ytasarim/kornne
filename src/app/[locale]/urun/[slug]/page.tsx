import { TrackEvent } from "@/components/analytics/AnalyticsRoot";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, FileText, Mail, Phone, Receipt } from "lucide-react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { PriceStatusBlock } from "@/components/catalog/PriceStatusBlock";
import { BestsellerBadge } from "@/components/catalog/BestsellerBadge";
import { isBestseller } from "@/config/badges";
import { cardLabels } from "@/components/catalog/ProductCard";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { whatsappHref, WhatsAppIcon } from "@/components/layout/WhatsAppCta";
import { AddToQuote } from "@/components/quote/AddToQuote";
import { StickyQuoteBar } from "@/components/quote/StickyQuoteBar";
import { JsonLd } from "@/components/seo/JsonLd";
import { Badge } from "@/components/ui/Badge";
import { catalog, CATALOG_DATA_VERIFIED } from "@/lib/catalog";
import { toCard } from "@/lib/catalog/cards";
import { entityAlternates } from "@/lib/i18n/alternates";
import { ENABLED_LOCALES } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { getI18n } from "@/lib/i18n/server";
import { breadcrumbJsonLd, productJsonLd } from "@/lib/seo/json-ld";
import { buildMetadata, toMetaDescription } from "@/lib/seo/metadata";
import { getContact, getFaq } from "@/lib/cms/store";
import { getSiteUrl } from "@/lib/seo/site";
import { FOREIGN_FLAT_SHIPPING_MINOR, FOREIGN_SHIPPING_CURRENCY, FOREIGN_TARGET_COUNTRY, RETURN_WINDOW_DAYS } from "@/lib/commerce/shipping";

export const revalidate = 300;

/** Only locales where the product page really exists (Turkish source + approved translations). RU/AR: none yet. */
export async function generateStaticParams() {
  const out: { locale: string; slug: string }[] = [];
  for (const locale of ENABLED_LOCALES) for (const p of await catalog.listProducts(locale)) if (p.pageLocale === locale) out.push({ locale, slug: p.slug });
  return out;
}

async function load(localeParam: string, rawSlug: string) {
  const i18n = getI18n(localeParam);
  const product = await catalog.getProduct(i18n.locale, decodeURIComponent(rawSlug));
  // Records held for review are redirected (307) by the proxy before this point (src/lib/redirects.ts).
  if (!product) notFound();
  return { ...i18n, product };
}

export async function generateMetadata({ params }: PageProps<"/[locale]/urun/[slug]">) {
  const { locale, slug } = await params;
  const { locale: l, d } = getI18n(locale);
  const product = await catalog.getProduct(l, decodeURIComponent(slug));
  if (!product) return {};
  const slugs = Object.fromEntries(product.translatedLocales.map((x) => [x, product.slugs[x]]));
  const img = product.images[0];
  return buildMetadata({
    title: product.seoTitle || product.title,
    description: product.seoDescription || toMetaDescription(product.descriptionText, `${product.title} — ${d.meta.defaultDescription}`),
    path: `/urun/${product.slug}`,
    locale: l,
    alternates: entityAlternates("/urun", slugs) ?? false,
    image: img ? { url: img.src, width: img.width, height: img.height, alt: img.alt } : undefined,
    noindex: !CATALOG_DATA_VERIFIED,
  });
}

export default async function ProductPage({ params }: PageProps<"/[locale]/urun/[slug]">) {
  const { locale: localeParam, slug } = await params;
  const { locale, d, href, t, product } = await load(localeParam, slug);
  const contact = await getContact();
  // product Q&A: only published, sourced answers in this language (Admin › İçerik › SSS)
  const qa = product.id.startsWith("snapshot:") ? [] : await getFaq(locale, product.id);
  const categories = await catalog.listCategories(locale);
  const primary = categories.find((c) => c.key === product.primaryCategoryKey);
  const productCats = categories.filter((c) => !c.isAllProducts && product.categoryKeys.includes(c.key));
  const path = href(`/urun/${product.slug}`);
  const crumbs = [{ name: d.nav.home, path: href("/") }, ...(primary ? [{ name: primary.name, path: href(`/kategori/${primary.slug}`) }] : []), { name: product.title, path }];
  // related = same primary category (a real relation from the source data), never invented cross-sells
  // editor-chosen related products first (Admin › Ürün › İlişkiler), otherwise the same primary category
  const related = product.relatedSourceIds.length
    ? (await catalog.listProducts(locale)).filter((p) => product.relatedSourceIds.includes(p.sourceId)).slice(0, 8)
    : primary
      ? ((await catalog.getCategory(locale, primary.slug))?.products.filter((p) => p.sourceId !== product.sourceId).slice(0, 4) ?? [])
      : [];
  const pageUrl = `${getSiteUrl()}${path}`;
  // contact messages carry only the product name + public product number (no personal data in URLs)
  const ref = `${product.title} (${d.productInfo.ref} ${product.sourceId})`;
  const waMessage = t(d.product.whatsappMessage, { url: `${ref} — ${pageUrl}` });
  const mail = `mailto:${contact.email}?subject=${encodeURIComponent(t(d.quote.emailSubject, { product: ref }))}&body=${encodeURIComponent(t(d.quote.emailBody, { url: pageUrl }))}`;
  const variants = product.variants.flatMap((v) => v.options);
  // verified KDV-dahil price → cart mode (Sprint 12); otherwise the quote flow stays
  const purchasable = product.priceVerified && product.priceMinor !== null && product.vatIncluded !== null;
  const ldAvailability = { IN_STOCK: "InStock", OUT_OF_STOCK: "OutOfStock", PREORDER: "PreOrder", BACKORDER: "BackOrder", MADE_TO_ORDER: "InStock" } as const; // same mapping as the Merchant feed
  const usd = product.currency === FOREIGN_SHIPPING_CURRENCY;
  const offer =
    // made to order only with a real lead time (same rule as the Merchant feed) — never an "in stock" guess
    purchasable && product.priceMinor !== null && product.availability && (product.availability !== "MADE_TO_ORDER" || (product.leadTimeDays ?? 0) > 0)
      ? {
          priceMinor: product.priceMinor,
          currency: product.currency,
          availability: ldAvailability[product.availability],
          shipping: usd ? { country: FOREIGN_TARGET_COUNTRY, priceMinor: FOREIGN_FLAT_SHIPPING_MINOR, currency: FOREIGN_SHIPPING_CURRENCY } : null,
          returns: usd ? { country: FOREIGN_TARGET_COUNTRY, days: RETURN_WINDOW_DAYS, customerPaysFreight: true } : null,
        }
      : null;
  const langLinks = Object.fromEntries(
    ENABLED_LOCALES.map((l) => [l, product.slugs[l] ? localizePath(l, `/urun/${product.slugs[l]}`) : primary?.slugs[l] ? localizePath(l, `/kategori/${primary.slugs[l]}`) : localizePath(l, "/")]),
  );
  const sections = [
    { id: "aciklama", label: d.productInfo.description },
    { id: "bilgiler", label: d.productInfo.title },
    ...(related.length ? [{ id: "benzer", label: d.product.related }] : []),
  ];

  return (
    <div className="container-site py-8 md:py-12" data-analytics-location="product" data-analytics-list="related" data-analytics-list-name="related">
      <TrackEvent name="view_item" params={{ items: [{ item_id: product.sourceId, item_name: product.title, item_category: primary?.name }] }} />
      <PageLanguageLinks links={langLinks} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {/* Offer only for a VERIFIED, purchasable price with a real stock state — the same amount the page and cart show (Google Shopping). */}
      <JsonLd data={productJsonLd({ name: product.title, description: product.descriptionText.slice(0, 5000) || product.title, path, images: product.images.map((i) => i.src), locale, sku: product.sourceId, brand: product.brandName, mpn: product.mpn, gtin: product.gtin, offer: offer })} />
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <ProductGallery images={product.images} title={product.title} labels={{ gallery: d.product.gallery, prev: d.product.prevImage, next: d.product.nextImage, zoom: d.product.openZoom, close: d.a11y.close, imageOf: d.product.imageOf, noImage: d.product.noImage }} />
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {primary ? (
                <Link href={href(`/kategori/${primary.slug}`)}>
                  <Badge tone="brand">{primary.name}</Badge>
                </Link>
              ) : null}
              {isBestseller(product) ? <BestsellerBadge label={d.shop.buy.bestseller} size="md" /> : null}
              <span className="text-xs font-medium tracking-wide text-steel uppercase">
                {d.productInfo.ref} {product.sourceId}
              </span>
            </div>
            <h1 className="font-display text-h1 font-bold text-ink">{product.title}</h1>
          </div>

          <PriceStatusBlock
            verified={product.priceVerified}
            priceMinor={product.priceMinor}
            compareAtMinor={product.compareAtMinor}
            vatIncluded={product.vatIncluded}
            currency={product.currency}
            locale={locale}
            labels={{ ...d.productInfo, price: d.product.price, oldPrice: d.product.oldPrice, discount: d.product.discount }}
          />

          <div id="quote-cta" className="scroll-mt-28">
            <AddToQuote
              product={{ ref: product.sourceId, title: product.title, href: path, image: product.images[0]?.src ?? null }}
              variants={variants}
              quoteHref={href("/teklif-listem")}
              labels={{ ...d.quoteList, option: d.quoteList.option }}
              cart={purchasable ? { href: href("/sepetim"), labels: d.shop.buy } : undefined}
            />
            {purchasable ? (
              <p className="mt-3 text-sm text-steel">
                {d.shop.buy.quoteAlt}{" "}
                <a href={href("/teklif-listem")} className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-300">
                  {d.shop.buy.quoteAltCta}
                </a>
              </p>
            ) : null}
          </div>

          <ul className="grid gap-2 rounded-[var(--radius-lg)] border border-line p-4 text-sm text-ink-2">
            <li className="flex items-start gap-2.5">
              <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-600" />
              {purchasable ? d.shop.buy.shippingNote : d.productInfo.leadTime}
            </li>
            <li className="flex items-start gap-2.5">
              <Receipt aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-600" />
              {purchasable ? d.shop.buy.priceNote : d.productInfo.vat}
            </li>
          </ul>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">{d.productInfo.contact}</p>
            <ul className="flex flex-wrap gap-2">
              <li>
                <a href={whatsappHref(waMessage, contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-whatsapp">
                  <WhatsAppIcon className="size-4 text-whatsapp" />
                  WhatsApp
                </a>
              </li>
              <li>
                <a href={`tel:${contact.phoneE164}`} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-brand-600">
                  <Phone aria-hidden="true" className="size-4 text-brand-600" />
                  <span dir="ltr">{contact.phoneDisplay}</span>
                </a>
              </li>
              <li>
                <a href={mail} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-brand-600">
                  <Mail aria-hidden="true" className="size-4 text-brand-600" />
                  {d.contact.email}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <nav aria-label={d.productInfo.sectionNav} className="sticky top-[4.5rem] z-20 -mx-4 mt-14 border-y border-line bg-surface/95 px-4 backdrop-blur md:top-[6.75rem] lg:mx-0 lg:rounded-[var(--radius-md)] lg:border">
        <ul className="flex gap-1 overflow-x-auto">
          {sections.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="inline-flex min-h-12 items-center px-3 text-sm font-semibold text-ink-2 hover:text-brand-700">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section id="aciklama" aria-labelledby="desc" className="min-w-0 scroll-mt-44">
          <h2 id="desc" className="mb-4 font-display text-h2 font-bold text-ink">
            {d.productInfo.description}
          </h2>
          {product.descriptionHtml ? <div className="rich max-w-none" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} /> : <p className="text-steel">{d.product.descriptionMissing}</p>}
        </section>

        <aside id="bilgiler" aria-labelledby="facts" className="h-fit scroll-mt-44 space-y-6 rounded-[var(--radius-lg)] border border-line p-6">
          <h2 id="facts" className="text-h3 font-bold text-ink">
            {d.productInfo.title}
          </h2>
          <dl className="divide-y divide-line text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-steel">{d.productInfo.ref}</dt>
              <dd className="font-semibold text-ink tabular-nums">{product.sourceId}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-steel">{d.productInfo.categories}</dt>
              <dd className="text-end">
                {productCats.map((c, i) => (
                  <span key={c.key}>
                    {i ? ", " : ""}
                    <Link href={href(`/kategori/${c.slug}`)} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                      {c.name}
                    </Link>
                  </span>
                ))}
              </dd>
            </div>
            {variants.length ? (
              <div className="flex justify-between gap-4 py-2.5">
                <dt className="text-steel">{d.productInfo.options}</dt>
                <dd className="text-end font-medium text-ink">{variants.map((v) => v.label).join(" · ")}</dd>
              </div>
            ) : null}
          </dl>

          <div>
            <h3 className="mb-2 text-base font-bold text-ink">{d.productInfo.specsTitle}</h3>
            {product.specs.length ? (
              <table className="w-full text-sm">
                <caption className="sr-only">{d.productInfo.specsTitle}</caption>
                <tbody className="divide-y divide-line">
                  {product.specs.map((s) => (
                    <tr key={s.key}>
                      <th scope="row" className="py-2 text-start font-normal text-steel">
                        {s.label}
                      </th>
                      <td className="py-2 text-end font-semibold text-ink">
                        {s.value}
                        {s.unit ? ` ${s.unit}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-steel">{d.productInfo.specsEmpty}</p>
            )}
          </div>

          {product.documents.length ? (
            <ul className="space-y-2">
              {product.documents.map((doc) => (
                <li key={doc.url}>
                  <a href={doc.url} className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-brand-600 hover:underline">
                    <FileText aria-hidden="true" className="size-4" />
                    {doc.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      </div>

      {qa.length ? (
        <section aria-labelledby="product-qa" className="mt-16">
          <h2 id="product-qa" className="mb-4 font-display text-h3 font-bold text-ink">
            {d.cms.productFaq}
          </h2>
          <div className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
            {qa.map((i) => (
              <details key={i.id} className="group p-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink">
                  {i.question}
                  <span aria-hidden="true" className="text-brand-700 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="rich mt-3" dangerouslySetInnerHTML={{ __html: i.answerHtml }} />
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {related.length ? (
        <section id="benzer" aria-labelledby="related" className="mt-16 scroll-mt-44">
          <h2 id="related" className="mb-6 font-display text-h2 font-bold text-ink">
            {d.product.related}
          </h2>
          <ProductGrid cards={related.map((p) => toCard(p, locale))} labels={cardLabels(d)} headingLevel={3} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" />
        </section>
      ) : null}

      <StickyQuoteBar title={product.title} cta={d.quote.cta} />
    </div>
  );
}
