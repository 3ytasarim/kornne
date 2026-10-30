import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceStatusBlock } from "@/components/catalog/PriceStatusBlock";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { Tabs } from "@/components/admin/ui";
import { Notice } from "@/components/ui/States";
import { livePrice } from "@/lib/admin/prices";
import { requireAdmin } from "@/lib/auth/guard";
import { sanitizeRichText } from "@/lib/catalog/sanitize";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";

export const metadata = { title: "Ürün önizleme", robots: { index: false, follow: false } };

/**
 * Admin-only preview of a product in any state (draft, review, archived) and any existing language — rendered with
 * the storefront components, from the CURRENT database values. Nothing here is public.
 */
export default async function ProductPreview({ params, searchParams }: PageProps<"/admin/products/[id]/preview">) {
  await requireAdmin("products");
  const { id } = await params;
  const sp = await searchParams;
  const p = await requireDb().product.findUnique({
    where: { id },
    include: { translations: true, media: { orderBy: { sortOrder: "asc" }, include: { media: { include: { translations: true } } } }, specs: { orderBy: { sortOrder: "asc" } }, prices: true, variants: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!p) notFound();
  const locales = p.translations.map((t) => t.locale as Locale);
  const locale = (locales.includes(sp.dil as Locale) ? sp.dil : "tr") as Locale;
  const t = p.translations.find((x) => x.locale === locale) ?? p.translations.find((x) => x.locale === "tr");
  if (!t) notFound();
  const { d } = getI18n(locale);
  const live = livePrice(p.prices);
  const images = p.media.map(({ media }) => ({ src: `/upload/${media.publicPath.replace(/^\/upload\//, "").split("/").map(encodeURIComponent).join("/")}`, alt: media.translations.find((x) => x.locale === locale)?.alt ?? media.translations.find((x) => x.locale === "tr")?.alt ?? t.title, width: media.width, height: media.height }));
  const visible = p.status === "PUBLISHED" && !p.needsReview && ["LEGACY_SOURCE", "APPROVED"].includes(t.status);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/products/${p.id}`} className="text-brand-700 hover:underline dark:text-brand-300">
          ← Düzenlemeye dön
        </Link>
      </p>
      <Notice tone={visible ? "info" : "warning"} className="mb-4">
        Önizleme — {visible ? "bu sürüm vitrinde yayında." : "bu sürüm vitrinde YAYINDA DEĞİL (taslak / inceleme / arşiv)."} Fiyat ve teknik tabloda yalnız onaylı veriler gösterilir; vitrin davranışı budur.
      </Notice>
      {locales.length > 1 ? <Tabs label="Önizleme dili" current={locale} items={locales.map((l) => ({ key: l, label: LOCALE_META[l].nativeName, href: `/admin/products/${p.id}/preview?dil=${l}` }))} /> : null}
      <article lang={locale} dir={dirOf(locale)} className="grid gap-8 rounded-[var(--radius-lg)] border border-line bg-bg p-4 sm:p-8 lg:grid-cols-2">
        <div>{images.length ? <ProductGallery images={images} title={t.title} labels={{ gallery: d.product.gallery, prev: d.product.prevImage, next: d.product.nextImage, zoom: d.product.openZoom, close: d.a11y.close, imageOf: d.product.imageOf, noImage: d.product.noImage }} /> : <p className="text-steel">Görsel yok.</p>}</div>
        <div className="space-y-5">
          <h1 className="font-display text-h2 font-bold text-ink">{t.title}</h1>
          <PriceStatusBlock verified={!!live} priceMinor={live?.amountMinor ?? null} compareAtMinor={live?.compareAtMinor ?? null} vatIncluded={live?.vatIncluded ?? null} currency="TRY" locale={locale} labels={{ priceTitle: d.productInfo.priceTitle, priceText: d.productInfo.priceText, vatIncluded: d.productInfo.vatIncluded, vatExcluded: d.productInfo.vatExcluded, price: d.product.price, oldPrice: d.product.oldPrice, discount: d.product.discount }} />
          {p.variants.length ? (
            <p className="text-sm text-steel">
              {d.productInfo.options}: {p.variants.map((v) => (v.labels as Record<string, string>)[locale] ?? (v.labels as Record<string, string>).tr).join(" · ")}
            </p>
          ) : null}
          <div className="rich" dangerouslySetInnerHTML={{ __html: sanitizeRichText(t.descriptionHtml ?? "") }} />
          <div>
            <h2 className="mb-2 text-lg font-bold text-ink">{d.productInfo.specsTitle}</h2>
            {p.specs.filter((s) => s.status === "VERIFIED").length ? (
              <table className="w-full text-sm">
                <tbody>
                  {p.specs
                    .filter((s) => s.status === "VERIFIED")
                    .map((s) => (
                      <tr key={s.id} className="border-t border-line">
                        <th scope="row" className="py-2 text-start font-medium text-steel">
                          {(s.labels as Record<string, string>).tr}
                        </th>
                        <td className="py-2 text-ink">
                          {(s.values as Record<string, string>).tr} {s.unit}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-steel">{d.productInfo.specsEmpty}</p>
            )}
            {p.specs.some((s) => s.status !== "VERIFIED") ? <p className="mt-2 text-xs text-warning">Doğrulanmamış {p.specs.filter((s) => s.status !== "VERIFIED").length} özellik vitrinde gösterilmez.</p> : null}
          </div>
        </div>
      </article>
    </>
  );
}
