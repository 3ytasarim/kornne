"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Landmark, Loader2, MessageSquareQuote, ShieldCheck, ShoppingCart, Trash2 } from "lucide-react";
import { priceCartAction, type PricedCart } from "@/app/[locale]/odeme/actions";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { QuantityStepper } from "@/components/quote/QuantityStepper";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { money } from "@/lib/commerce/money-client";
import { quoteList, useQuoteList } from "@/lib/quote/store";

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Cart (Sprint 12). Lines live in localStorage (product refs + quantities only); every price, the VAT split and the total
 * come from the server (priceCartAction → VERIFIED database prices), recomputed whenever the lines change.
 */
export function CartView({ locale, labels, list, checkoutHref, quoteHref, browseHref }: { locale: Locale; labels: Dictionary["shop"]["cart"]; list: Dictionary["quoteList"]; checkoutHref: string; quoteHref: string; browseHref: string }) {
  const hydrated = useHydrated();
  const lines = useQuoteList();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [pending, start] = useTransition();
  const key = JSON.stringify(lines.map((l) => [l.productRef, l.variantId, l.quantity]));

  useEffect(() => {
    if (!lines.length) return;
    start(async () => {
      const r = await priceCartAction(lines.map((l) => ({ productRef: l.productRef, variantId: l.variantId, quantity: l.quantity }))).catch((): PricedCart => ({ ok: false, code: "error" }));
      setPriced(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-price only when refs/quantities change
  }, [key]);

  if (!hydrated) {
    return (
      <div aria-busy="true" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (!lines.length) {
    return <EmptyState icon={<ShoppingCart aria-hidden="true" className="size-7" />} title={labels.empty} text={labels.emptyText} action={<ButtonLink href={browseHref}>{labels.browse}</ButtonLink>} />;
  }

  const ok = priced?.ok ? priced : null;
  const lineOf = (ref: string, variantId: string | null) => ok?.lines.find((x) => x.productRef === ref && x.variantId === variantId);
  const badRef = priced && !priced.ok ? priced.productRef : undefined;
  const vatRate = ok?.lines[0] ? ok.lines[0].vatRateBp / 100 : 20;
  const problem = priced && !priced.ok ? (priced.code === "variant" ? labels.variantNeeded : priced.code === "not_purchasable" ? labels.unavailable : labels.priceError) : null;

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-labelledby="cart-lines">
        <h2 id="cart-lines" className="sr-only">
          {format(labels.items, { count: lines.length })}
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
          {lines.map((l) => {
            const p = lineOf(l.productRef, l.variantId);
            const bad = badRef === l.productRef;
            return (
              <li key={`${l.productRef}|${l.variantId ?? ""}`} className={bad ? "bg-signal-50" : undefined}>
                <div className="flex gap-4 p-4 sm:p-5">
                  <span className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-2 sm:size-24">{l.image ? <Image src={l.image} alt="" fill sizes="96px" className="object-contain p-2 mix-blend-multiply dark:mix-blend-normal" /> : null}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link href={l.href} className="line-clamp-2 font-semibold text-ink hover:text-brand-700">
                          {l.title}
                        </Link>
                        {l.variantLabel ? <p className="text-sm text-steel">{l.variantLabel}</p> : null}
                        <p className="mt-1 text-sm text-steel">
                          {labels.unitPrice}:{" "}
                          <span className="font-medium text-ink-2 tabular-nums" dir="ltr">
                            {p ? money(p.unitMinor, locale) : "—"}
                          </span>
                        </p>
                      </div>
                      <p className="shrink-0 text-end font-bold text-ink tabular-nums" dir="ltr" data-testid="cart-line-total">
                        {p ? money(p.lineMinor, locale) : pending ? <Loader2 aria-hidden="true" className="ms-auto size-4 animate-spin text-steel" /> : "—"}
                      </p>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center gap-3">
                      <QuantityStepper size="sm" value={l.quantity} onChange={(n) => quoteList.setQuantity(l, n)} labels={{ quantity: `${list.quantity} — ${l.title}`, decrease: list.decrease, increase: list.increase }} />
                      <button type="button" onClick={() => quoteList.remove(l)} aria-label={`${list.remove}: ${l.title}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-sm font-medium text-steel hover:text-signal-ink">
                        <Trash2 aria-hidden="true" className="size-4" />
                        <span className="hidden sm:inline">{list.remove}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <Link href={browseHref} className="mt-4 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
          <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
          {labels.continueShopping}
        </Link>
      </section>

      <aside aria-labelledby="cart-summary" className="rounded-[var(--radius-xl)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] lg:sticky lg:top-36">
        <h2 id="cart-summary" className="text-h3 font-bold text-ink">
          {labels.summary}
        </h2>
        <div aria-live="polite" aria-busy={pending}>
          {problem ? (
            <p role="alert" className="mt-4 flex gap-2 rounded-[var(--radius-md)] border border-signal/30 bg-signal-50 p-3 text-sm text-signal-ink">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {problem}
            </p>
          ) : null}
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-steel">{labels.net}</dt>
              <dd className="font-medium text-ink tabular-nums" dir="ltr">
                {ok ? money(ok.netMinor, locale) : "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-steel">{format(labels.vat, { rate: vatRate })}</dt>
              <dd className="font-medium text-ink tabular-nums" dir="ltr">
                {ok ? money(ok.vatMinor, locale) : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
              <dt className="text-base font-semibold text-ink">{labels.total}</dt>
              <dd className="text-2xl font-bold tracking-tight text-ink tabular-nums" dir="ltr" data-testid="cart-total">
                {ok ? money(ok.totalMinor, locale) : pending ? labels.calculating : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 space-y-3">
          {ok?.checkoutOpen ? (
            <ButtonLink href={checkoutHref} size="lg" className="w-full" iconEnd={<ArrowRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />}>
              {labels.checkout}
            </ButtonLink>
          ) : ok ? (
            <p className="rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm text-ink-2">{labels.checkoutClosed}</p>
          ) : null}
          <ButtonLink href={quoteHref} variant={ok?.checkoutOpen ? "outline" : "primary"} size="lg" className="w-full" icon={<MessageSquareQuote aria-hidden="true" className="size-5" />}>
            {labels.quoteThisCart}
          </ButtonLink>
        </div>

        <ul className="mt-6 space-y-2 border-t border-line pt-5 text-sm text-steel">
          <li className="flex gap-2">
            <Landmark aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" />
            {labels.paymentMethod}
          </li>
          <li className="flex gap-2">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
            {labels.secure}
          </li>
        </ul>
      </aside>
    </div>
  );
}
