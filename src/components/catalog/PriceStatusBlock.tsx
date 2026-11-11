import { MessageSquareQuote } from "lucide-react";
import type { Locale } from "@/lib/i18n/config";
import { PriceBlock } from "./PriceBlock";

/**
 * Price area driven by the price STATUS (docs/architecture/commerce-modes.md):
 *  - UNVERIFIED (all 41 legacy prices today): "Price on request" — no amount, no discount, no VAT claim.
 *  - VERIFIED: amount + previous price (only if really higher) + explicit VAT treatment. A verified price without
 *    a known VAT treatment is treated as not displayable (falls back to the quote block).
 */
export function PriceStatusBlock({
  verified,
  priceMinor,
  compareAtMinor,
  vatIncluded,
  currency,
  locale,
  labels,
}: {
  verified: boolean;
  priceMinor: bigint | null;
  compareAtMinor: bigint | null;
  vatIncluded: boolean | null;
  currency: string;
  locale: Locale;
  labels: { priceTitle: string; priceText: string; vatIncluded: string; vatExcluded: string; price: string; oldPrice: string; discount: string };
}) {
  if (verified && priceMinor !== null && vatIncluded !== null) {
    return (
      <div data-price-status="verified" className="space-y-1.5 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5">
        <PriceBlock priceMinor={priceMinor} compareAtMinor={compareAtMinor} currency={currency} locale={locale} labels={labels} size="lg" />
        {(vatIncluded ? labels.vatIncluded : labels.vatExcluded) ? <p className="text-sm text-steel">{vatIncluded ? labels.vatIncluded : labels.vatExcluded}</p> : null}
      </div>
    );
  }
  return (
    <div data-price-status="unverified" className="rounded-[var(--radius-lg)] border border-brand-300/60 bg-brand-50 p-5">
      <p className="flex items-center gap-2 text-lg font-bold text-brand-800 dark:text-brand-300">
        <MessageSquareQuote aria-hidden="true" className="size-5 shrink-0" />
        {labels.priceTitle}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{labels.priceText}</p>
    </div>
  );
}
