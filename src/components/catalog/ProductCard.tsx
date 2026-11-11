import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ImageOff, MessageSquareQuote } from "lucide-react";
import type { CardData } from "@/lib/catalog/cards";
import { QuickAddButton } from "@/components/shop/QuickAddButton";
import { BestsellerBadge } from "./BestsellerBadge";

/**
 * Product card (Sprint 12 shop redesign). Single link target (stretched title link; image link hidden from AT),
 * configurable heading level. Shows the VERIFIED KDV-dahil price and a one-tap "add to cart" when the product has no
 * option to choose; otherwise a clear "price on request" line. No old/strike-through price (client decision 23.10.2026),
 * no rating stars or stock badges (no verified data). Works in server and client trees (pure props + client button).
 */
export type CardLabels = { priceOnRequest: string; discount: string; noImage: string; turkishContent: string; addToCart: string; added: string; addAria: string; vatIncluded: string; chooseOption: string; bestseller: string };

export function ProductCard({ card, labels, headingLevel = 3, priority = false }: { card: CardData; labels: CardLabels; headingLevel?: 2 | 3; priority?: boolean }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const item = JSON.stringify({ item_id: card.id, item_name: card.title });
  return (
    <article className="group relative flex h-full flex-col rounded-[var(--radius-lg)] border border-line bg-surface p-2 transition-[box-shadow,border-color,transform] duration-300 ease-[var(--ease-premium)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-card)] motion-reduce:hover:translate-y-0">
      <Link href={card.href} hrefLang={card.hrefLang ?? undefined} data-analytics-item={item} tabIndex={-1} aria-hidden="true" className="relative block aspect-square overflow-hidden rounded-[calc(var(--radius-lg)-6px)] bg-surface-2 sm:aspect-[4/3.4]">
        {card.image ? (
          <Image src={card.image.src} alt="" fill priority={priority} sizes="(min-width:1280px) 300px, (min-width:768px) 33vw, calc(50vw - 24px)" quality={70} className="object-contain p-4 mix-blend-multiply transition-transform duration-500 ease-[var(--ease-premium)] group-hover:scale-[1.04] dark:mix-blend-normal" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center gap-2 text-steel">
            <ImageOff aria-hidden="true" className="size-6" />
            <span className="text-xs">{labels.noImage}</span>
          </span>
        )}
        {card.bestseller ? <BestsellerBadge label={labels.bestseller} className="absolute start-2 top-2" /> : null}
        {card.titleLang ? <span className="absolute end-2 top-2 rounded-full bg-surface/90 px-2 py-0.5 text-[0.6875rem] font-semibold text-steel uppercase shadow-sm">{card.titleLang}</span> : null}
      </Link>
      <div className="flex flex-1 flex-col gap-3 px-2 pt-3 pb-2">
        <H className="line-clamp-2 min-h-[2.6em] text-[0.9375rem] leading-snug font-semibold [overflow-wrap:anywhere] hyphens-auto text-ink sm:text-base" lang={card.titleLang ?? undefined} dir={card.titleLang ? "ltr" : undefined}>
          <Link href={card.href} hrefLang={card.hrefLang ?? undefined} data-analytics-item={item} className="after:absolute after:inset-0 after:rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-focus">
            {card.title}
          </Link>
        </H>
        {card.titleLang ? <span className="sr-only">{labels.turkishContent}</span> : null}
        {card.bestseller ? <span className="sr-only">{labels.bestseller}</span> : null}
        <div className="mt-auto space-y-3">
          {card.price ? (
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="min-w-0 text-base font-bold tracking-tight [overflow-wrap:anywhere] text-ink tabular-nums sm:text-xl" dir="ltr">
                {card.price}
              </span>
              <span className="text-xs font-medium text-steel">{labels.vatIncluded}</span>
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 dark:text-brand-300">
              <MessageSquareQuote aria-hidden="true" className="size-4" />
              {labels.priceOnRequest}
            </p>
          )}
          {card.quickAdd ? (
            <QuickAddButton product={{ ref: card.id, title: card.title, href: card.href, image: card.image?.src ?? null }} labels={{ add: labels.addToCart, added: labels.added, aria: labels.addAria }} className="w-full" />
          ) : (
            <span aria-hidden="true" className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-line-strong text-sm font-semibold text-ink transition-colors group-hover:border-brand-700 group-hover:text-brand-700 dark:group-hover:text-brand-300">
              {card.price ? labels.chooseOption : labels.priceOnRequest}
              <ArrowUpRight className="size-4 rtl:-scale-x-100" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function cardLabels(d: { quote: { cardLabel: string }; product: { discount: string; noImage: string }; listing: { turkishContent: string }; quoteList: { chooseOption: string }; shop: { buy: { addToCart: string; added: string; addAria: string; vatIncluded: string; bestseller: string } } }): CardLabels {
  return { priceOnRequest: d.quote.cardLabel, discount: d.product.discount, noImage: d.product.noImage, turkishContent: d.listing.turkishContent, addToCart: d.shop.buy.addToCart, added: d.shop.buy.added, addAria: d.shop.buy.addAria, vatIncluded: d.shop.buy.vatIncluded, chooseOption: d.quoteList.chooseOption, bestseller: d.shop.buy.bestseller };
}
