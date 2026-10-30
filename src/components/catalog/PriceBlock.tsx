import type { Locale } from "@/lib/i18n/config";
import { discountPercent, formatMoney } from "@/lib/money";
import { format } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/cn";

/**
 * Price display. The discount badge appears ONLY when the previous price is really higher (legacy shop showed
 * "-%0" and negative discounts). No price → nothing rendered (quote-only products).
 */
export function PriceBlock({
  priceMinor,
  compareAtMinor,
  currency,
  locale,
  labels,
  size = "md",
}: {
  priceMinor: bigint | null;
  compareAtMinor: bigint | null;
  currency: string;
  locale: Locale;
  labels: { price: string; oldPrice: string; discount: string };
  size?: "md" | "lg";
}) {
  if (priceMinor === null) return null;
  const pct = discountPercent(priceMinor, compareAtMinor);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="sr-only">{labels.price}:</span>
      <span className={cn("font-bold text-ink tabular-nums", size === "lg" ? "text-h2" : "text-lg")} dir="ltr">
        {formatMoney(priceMinor, currency, locale)}
      </span>
      {pct !== null && compareAtMinor !== null ? (
        <>
          <span className="sr-only">{labels.oldPrice}:</span>
          <s className={cn("text-steel tabular-nums", size === "lg" ? "text-base" : "text-sm")} dir="ltr">
            {formatMoney(compareAtMinor, currency, locale)}
          </s>
          <span className="rounded-full bg-signal px-2 py-0.5 text-xs font-bold text-white">{format(labels.discount, { pct })}</span>
        </>
      ) : null}
    </div>
  );
}
