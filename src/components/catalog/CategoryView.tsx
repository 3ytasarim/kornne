import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { ListingControls, type ListingLabels } from "@/components/catalog/ListingControls";
import { Pagination } from "@/components/catalog/Pagination";
import { cardLabels } from "@/components/catalog/ProductCard";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { TrackEvent } from "@/components/analytics/AnalyticsRoot";
import { EmptyState } from "@/components/ui/States";
import { catalog, CATALOG_DATA_VERIFIED } from "@/lib/catalog";
import { toCard } from "@/lib/catalog/cards";
import { paginate, PAGE_SIZE } from "@/lib/catalog/pagination";
import { entityAlternates } from "@/lib/i18n/alternates";
import { format } from "@/lib/i18n/dictionaries";
import { localizePath } from "@/lib/i18n/routes";
import { getI18n } from "@/lib/i18n/server";
import { breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { cn } from "@/lib/cn";

const pagePath = (base: string, n: number) => (n <= 1 ? base : `${base}/${n}`);

export async function categoryMetadata(localeParam: string, slug: string, page: number) {
  const { locale, d, t } = getI18n(localeParam);
  const data = await catalog.getCategory(locale, slug);
  if (!data) return {};
  const { category, products } = data;
  const { pages } = paginate(products, page);
  const base = localizePath(locale, `/kategori/${category.slug}`);
  return buildMetadata({
    title: page > 1 ? `${category.seoTitle || category.name} — ${t(d.category.pageOf, { page, pages })}` : category.seoTitle || category.name,
    description: category.seoDescription || `${category.name} — ${t(d.category.productCount, { count: category.productCount })}. ${d.meta.defaultDescription}`,
    path: `/kategori/${category.slug}`,
    publicPath: pagePath(base, page),
    locale,
    // paginated pages are self-canonical; hreflang only on page 1 (equivalents exist for every category translation)
    alternates: page === 1 ? (entityAlternates("/kategori", Object.fromEntries(category.translatedLocales.map((l) => [l, category.slugs[l]]))) ?? false) : false,
    // a category name still IN_REVIEW in this language → page is shown (navigation) but not offered to search engines
    noindex: !CATALOG_DATA_VERIFIED || !category.translatedLocales.includes(locale),
  });
}

export async function CategoryView({ localeParam, slug, page: requested }: { localeParam: string; slug: string; page: number }) {
  const { locale, d, href, t } = getI18n(localeParam);
  const data = await catalog.getCategory(locale, slug);
  if (!data) notFound();
  const { category, products } = data;
  const { items, page, pages } = paginate(products, requested);
  if (requested !== page) notFound();
  const categories = await catalog.listCategories(locale);
  const base = href(`/kategori/${category.slug}`);
  const crumbs = [
    { name: d.nav.home, path: href("/") },
    { name: category.name, path: pagePath(base, page) },
  ];
  const labels = cardLabels(d);
  const allCards = products.map((p) => toCard(p, locale));
  const pageCards = items.map((p) => toCard(p, locale));
  const langLinks = Object.fromEntries(Object.entries(category.slugs).map(([l, s]) => [l, localizePath(l as typeof locale, `/kategori/${s}`)]));
  const filterCategories = categories.filter((c) => !c.isAllProducts && c.key !== category.key && products.some((p) => p.categoryKeys.includes(c.key))).map((c) => ({ key: c.key, name: c.name }));
  const pagination = { nav: d.a11y.pagination, prev: d.category.prev, next: d.category.next, pageOf: d.category.pageOf };
  const listingLabels: ListingLabels = { ...d.listing, pagination };

  const staticList = (
    <div>
      <div aria-hidden="true" className="mb-6 h-[4.75rem] rounded-[var(--radius-lg)] border border-line bg-surface-2 max-sm:h-[13.5rem]" />
      <p className="mb-4 min-h-8 text-sm text-steel">{format(d.listing.showing, { count: products.length })}</p>
      {pageCards.length ? <ProductGrid cards={pageCards} labels={labels} priorityCount={2} /> : <EmptyState title={d.category.empty} />}
      <Pagination page={page} pages={pages} hrefFor={(n) => pagePath(base, n)} labels={{ ...pagination, pageOf: t(d.category.pageOf, { page, pages }) }} />
    </div>
  );

  return (
    <div className="container-site py-8 md:py-12" data-analytics-list={category.key} data-analytics-list-name={category.name}>
      <TrackEvent name="view_item_list" params={{ item_list_id: category.key, item_list_name: category.name, items: pageCards.slice(0, 24).map((c, i) => ({ item_id: c.id, item_name: c.title, index: i })) }} />
      <PageLanguageLinks links={langLinks} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={collectionPageJsonLd({ name: category.name, description: category.description, path: pagePath(base, page), locale, items: pageCards.map((c) => ({ name: c.title, path: c.href })) })} />
      <Breadcrumbs items={crumbs} label={d.a11y.breadcrumb} />
      <header className="mt-6 mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-h1 font-bold text-ink">{category.name}</h1>
          <p className="mt-2 text-steel">
            {t(d.category.productCount, { count: category.productCount })}
            {pages > 1 ? ` · ${t(d.category.pageOf, { page, pages })}` : ""}
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
        <nav aria-label={d.nav.categories} className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {categories.map((c) => (
              <li key={c.key} className="shrink-0">
                <Link
                  href={href(`/kategori/${c.slug}`)}
                  aria-current={c.key === category.key ? "page" : undefined}
                  className={cn("flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-md)] border px-4 text-sm font-semibold whitespace-nowrap", c.key === category.key ? "border-brand-700 bg-brand-700 text-white" : "border-line text-ink hover:border-brand-600")}
                >
                  {c.name}
                  <span className={cn("text-xs", c.key === category.key ? "text-white/80" : "text-steel")}>{c.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">
          {/* Static HTML = the real page list; the client enhances it with sort/filter when URL params are present */}
          <Suspense fallback={staticList}>
            <ListingControls cards={allCards} page={page} pageSize={PAGE_SIZE} basePath={base} locale={locale} categories={filterCategories} labels={listingLabels} cardLabels={labels} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
