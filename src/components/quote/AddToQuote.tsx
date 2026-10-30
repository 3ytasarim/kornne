"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { ClipboardList, MessageSquareQuote, ShoppingCart, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { format } from "@/lib/i18n/format";
import { quoteList, useQuoteList } from "@/lib/quote/store";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";
import { QuantityStepper } from "./QuantityStepper";

export type AddToQuoteLabels = { add: string; added: string; inList: string; requestNow: string; quantity: string; decrease: string; increase: string; option: string; chooseOption: string; view: string };

/**
 * Product-level quote CTA: (real) variant choice + quantity → quote list. "Request a quote for this product" adds it
 * and opens the quote list form. Never a cart / buy button — prices are not verified.
 */
export type CartModeLabels = { addToCart: string; added: string; buyNow: string; inCart: string; viewCart: string };

export function AddToQuote({
  product,
  variants,
  quoteHref,
  labels,
  cart,
}: {
  product: { ref: string; title: string; href: string; image: string | null };
  variants: { id: string; label: string }[];
  quoteHref: string;
  labels: AddToQuoteLabels;
  /** Sprint 12: verified price → the same list works as the cart ("Sepete ekle" / "Hemen sipariş ver") */
  cart?: { href: string; labels: CartModeLabels };
}) {
  const router = useRouter();
  const { notify } = useToast();
  const lines = useQuoteList();
  const groupId = useId();
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const needsVariant = variants.length > 0;
  const variant = variants.find((v) => v.id === variantId) ?? null;
  const inList = lines.filter((l) => l.productRef === product.ref).reduce((a, l) => a + l.quantity, 0);

  const add = () => {
    if (needsVariant && !variant) {
      setError(true);
      return false;
    }
    quoteList.add({ productRef: product.ref, variantId: variant?.id ?? null, variantLabel: variant?.label ?? null, quantity: qty, title: product.title, href: product.href, image: product.image });
    track("add_to_quote_list", { items: [{ item_id: product.ref, item_name: product.title, item_variant: variant?.label, quantity: qty }] });
    return true;
  };

  return (
    <div className="space-y-4">
      {needsVariant ? (
        <fieldset aria-describedby={error ? `${groupId}-err` : undefined}>
          <legend className="mb-2 text-sm font-semibold text-ink">{labels.option}</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <label key={v.id} className={cn("inline-flex min-h-12 cursor-pointer items-center rounded-full border px-4 text-sm font-medium has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus", v.id === variantId ? "border-brand-700 bg-brand-700 text-white" : "border-line-strong text-ink hover:border-brand-600")}>
                <input
                  type="radio"
                  name={groupId}
                  value={v.id}
                  checked={v.id === variantId}
                  onChange={() => {
                    setVariantId(v.id);
                    setError(false);
                  }}
                  className="sr-only"
                />
                {v.label}
              </label>
            ))}
          </div>
          {error ? (
            <p id={`${groupId}-err`} role="alert" className="mt-2 text-sm font-medium text-signal">
              {labels.chooseOption}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {cart ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <QuantityStepper value={qty} onChange={setQty} labels={labels} />
            <Button
              size="lg"
              className="flex-1"
              icon={<ShoppingCart aria-hidden="true" className="size-5" />}
              onClick={() => {
                if (add()) notify(cart.labels.added, "success");
              }}
            >
              {cart.labels.addToCart}
            </Button>
          </div>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            icon={<Zap aria-hidden="true" className="size-5" />}
            onClick={() => {
              if (add()) router.push(cart.href);
            }}
          >
            {cart.labels.buyNow}
          </Button>
          {inList > 0 ? (
            <p className="text-sm text-steel" role="status">
              {format(cart.labels.inCart, { qty: inList })} ·{" "}
              <a href={cart.href} className="font-semibold text-brand-600 underline underline-offset-2">
                {cart.labels.viewCart}
              </a>
            </p>
          ) : null}
        </>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper value={qty} onChange={setQty} labels={labels} />
        <Button
          size="lg"
          className="flex-1"
          icon={<ClipboardList aria-hidden="true" className="size-5" />}
          onClick={() => {
            if (add()) notify(labels.added, "success");
          }}
        >
          {labels.add}
        </Button>
      </div>
      <Button
        variant="outline"
        size="lg"
        className="w-full bg-surface"
        icon={<MessageSquareQuote aria-hidden="true" className="size-5" />}
        onClick={() => {
          if (add()) router.push(quoteHref);
        }}
      >
        {labels.requestNow}
      </Button>
      {inList > 0 ? (
        <p className="text-sm text-steel" role="status">
          {format(labels.inList, { qty: inList })} ·{" "}
          <a href={quoteHref} className="font-semibold text-brand-600 underline underline-offset-2">
            {labels.view}
          </a>
        </p>
      ) : null}
      </>
      )}
    </div>
  );
}
