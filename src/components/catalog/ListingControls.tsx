"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import type { CardData } from "@/lib/catalog/cards";
import { foldForSearch } from "@/lib/catalog/cards";
import { format } from "@/lib/i18n/format";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/States";
import { Pagination } from "./Pagination";
import { ProductGrid } from "./ProductGrid";
import type { CardLabels } from "./ProductCard";

/**
 * Sort + filter for a listing. URL is the state (?siralama=…&kategori=…&q=…&sayfa=…) so views are shareable and the
 * back button works. Without parameters the component renders exactly the server page (static HTML is identical),
 * so crawlers and no-JS clients always get the real list; filtered/sorted variants canonicalise to the base URL.
 */
export type ListingLabels = {
  sort: string;
  sortFeatured: string;
  sortNameAsc: string;
  sortNameDesc: string;
  filter: string;
  filterPlaceholder: string;
  categoryFilter: string;
  all: string;
  clear: string;
  showing: string;
  noMatch: string;
  pagination: { nav: string; prev: string; next: string; pageOf: string };
};

const SORTS = ["onerilen", "ad-artan", "ad-azalan"] as const;
type Sort = (typeof SORTS)[number];

export function ListingControls({
  cards,
  page,
  pageSize,
  basePath,
  locale,
  categories,
  labels,
  cardLabels,
}: {
  cards: CardData[];
  page: number;
  pageSize: number;
  basePath: string;
  locale: string;
  categories: { key: string; name: string }[];
  labels: ListingLabels;
  cardLabels: CardLabels;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const sort: Sort = (SORTS as readonly string[]).includes(params.get("siralama") ?? "") ? (params.get("siralama") as Sort) : "onerilen";
  const cat = params.get("kategori") ?? "";
  const q = params.get("q") ?? "";
  const [draft, setDraft] = useState(q);
  const active = sort !== "onerilen" || !!cat || !!q;
  const requestedPage = Math.max(1, Number(params.get("sayfa")) || 1);

  const filtered = useMemo(() => {
    if (!active) return cards;
    const terms = foldForSearch(q).split(/\s+/).filter(Boolean);
    const out = cards.filter((c) => (!cat || c.categoryKeys.includes(cat)) && terms.every((t) => c.searchText.includes(t)));
    const collator = new Intl.Collator(locale, { sensitivity: "base" });
    if (sort === "ad-artan") out.sort((a, b) => collator.compare(a.title, b.title));
    if (sort === "ad-azalan") out.sort((a, b) => collator.compare(b.title, a.title));
    return out;
  }, [cards, active, cat, q, sort, locale]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = active ? Math.min(requestedPage, pages) : page;
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);

  const push = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    if (!("sayfa" in next)) sp.delete("sayfa");
    if (sp.get("siralama") === "onerilen") sp.delete("siralama");
    const qs = sp.toString();
    // filtered views always start from the base listing path (not the static /2 page)
    startTransition(() => router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false }));
  };

  const hrefFor = (n: number) => {
    if (!active) return n <= 1 ? basePath : `${basePath}/${n}`;
    const sp = new URLSearchParams(params.toString());
    if (n > 1) sp.set("sayfa", String(n));
    else sp.delete("sayfa");
    return `${basePath}?${sp.toString()}`;
  };

  return (
    <div>
      <form
        role="search"
        className="mb-6 grid gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_auto] lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          push({ q: draft.trim().slice(0, 60) });
        }}
      >
        <div className="relative">
          <label htmlFor="listing-q" className="mb-1 block text-xs font-semibold text-steel">
            {labels.filter}
          </label>
          <input
            id="listing-q"
            type="search"
            value={draft}
            maxLength={60}
            placeholder={labels.filterPlaceholder}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value === "") push({ q: "" });
            }}
            className="block min-h-12 w-full rounded-[var(--radius-md)] border border-line-strong bg-surface ps-10 pe-3 text-[0.9375rem] text-ink placeholder:text-steel focus:border-brand-600 focus:outline-none"
          />
          <Search aria-hidden="true" className="pointer-events-none absolute start-3.5 bottom-4 size-4 text-steel" />
        </div>
        {categories.length > 1 ? (
          <div>
            <label htmlFor="listing-cat" className="mb-1 block text-xs font-semibold text-steel">
              {labels.categoryFilter}
            </label>
            <select id="listing-cat" value={cat} onChange={(e) => push({ kategori: e.target.value })} className="block min-h-12 w-full rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 pe-9 text-[0.9375rem] text-ink lg:w-56">
              <option value="">{labels.all}</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label htmlFor="listing-sort" className="mb-1 block text-xs font-semibold text-steel">
            {labels.sort}
          </label>
          <select id="listing-sort" value={sort} onChange={(e) => push({ siralama: e.target.value })} className="block min-h-12 w-full rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 pe-9 text-[0.9375rem] text-ink lg:w-48">
            <option value="onerilen">{labels.sortFeatured}</option>
            <option value="ad-artan">{labels.sortNameAsc}</option>
            <option value="ad-azalan">{labels.sortNameDesc}</option>
          </select>
        </div>
      </form>

      <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-steel">
          {format(labels.showing, { count: filtered.length })}
        </p>
        {active ? (
          <button
            type="button"
            onClick={() => {
              setDraft("");
              startTransition(() => router.replace(basePath, { scroll: false }));
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold text-ink hover:border-brand-600"
          >
            <X aria-hidden="true" className="size-4" />
            {labels.clear}
          </button>
        ) : null}
      </div>

      {slice.length ? <ProductGrid cards={slice} labels={cardLabels} priorityCount={active ? 0 : 2} /> : <EmptyState title={labels.noMatch} />}
      <div className={cn(pages <= 1 && "hidden")}>
        <Pagination page={current} pages={pages} hrefFor={hrefFor} labels={{ ...labels.pagination, pageOf: format(labels.pagination.pageOf, { page: current, pages }) }} />
      </div>
    </div>
  );
}
