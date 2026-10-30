import { TrackEvent } from "@/components/analytics/AnalyticsRoot";
import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import { cardLabels } from "@/components/catalog/ProductCard";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { SearchForm } from "@/components/layout/SearchForm";
import { catalog } from "@/lib/catalog";
import { toCard } from "@/lib/catalog/cards";
import { staticAlternates } from "@/lib/i18n/alternates";
import { getI18n } from "@/lib/i18n/server";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: PageProps<"/[locale]/arama">) {
  const { locale, d } = getI18n((await params).locale);
  // internal search result pages are never indexed (thin / infinite URL space)
  return buildMetadata({ title: d.search.title, description: d.meta.defaultDescription, path: "/arama", locale, noindex: true, alternates: false });
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/arama">) {
  const { locale, d, href, t } = getI18n((await params).locale);
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80).trim() ?? "";
  const tooShort = q.length > 0 && q.length < 2;
  const results = q && !tooShort ? await catalog.search(locale, q) : [];
  const labels = cardLabels(d);
  const showHelp = !q || tooShort || results.length === 0;
  const [categories, products] = showHelp ? await Promise.all([catalog.listCategories(locale), catalog.listProducts(locale)]) : [[], []];

  return (
    <div className="container-site py-8 md:py-12" data-analytics-list="search" data-analytics-list-name="search">
      {/* search_term is re-checked client-side: anything that looks like an e-mail / phone number is dropped */}
      {q && !tooShort ? <TrackEvent name="search" params={{ search_term: q, results_count: results.length }} /> : null}
      <PageLanguageLinks links={staticAlternates("/arama")} />
      <h1 className="font-display text-h1 font-bold text-ink">{d.search.title}</h1>
      <SearchForm action={href("/arama")} label={d.search.label} placeholder={d.search.placeholder} submit={d.search.submit} defaultValue={q} inputId="page-search" className="mt-6 max-w-2xl" />
      <p role="status" className="mt-6 text-steel">
        {tooShort ? d.searchHelp.minChars : q ? (results.length ? t(d.search.resultsFor, { q, count: results.length }) : t(d.search.noResults, { q })) : d.search.empty}
      </p>

      {results.length ? <ProductGrid cards={results.map((p) => toCard(p, locale))} labels={labels} className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" /> : null}

      {showHelp ? (
        <div className="mt-8 space-y-10">
          {q && !tooShort ? (
            <div className="flex items-start gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface-2 p-5 text-ink-2">
              <SearchX aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-steel" />
              <p>{d.searchHelp.tips}</p>
            </div>
          ) : null}
          <section aria-labelledby="search-cats">
            <h2 id="search-cats" className="mb-4 text-h3 font-bold text-ink">
              {d.searchHelp.browse}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <li key={c.key}>
                  <Link href={href(`/kategori/${c.slug}`)} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold text-ink hover:border-brand-600">
                    {c.name} <span className="text-xs text-steel">{c.productCount}</span>
                    <ArrowRight aria-hidden="true" className="size-4 text-brand-600 rtl:-scale-x-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="search-popular">
            <h2 id="search-popular" className="mb-4 text-h3 font-bold text-ink">
              {d.searchHelp.popular}
            </h2>
            <ProductGrid cards={products.slice(0, 4).map((p) => toCard(p, locale))} labels={labels} headingLevel={3} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" />
          </section>
        </div>
      ) : null}
    </div>
  );
}
