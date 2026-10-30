"use client";

import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { format } from "@/lib/i18n/format";
import { quoteList } from "@/lib/quote/store";
import { track } from "@/lib/analytics/client";
import { cn } from "@/lib/cn";

/** One-tap "add to cart" on product cards (only for products with a verified price and no option to choose). */
export function QuickAddButton({ product, labels, className }: { product: { ref: string; title: string; href: string; image: string | null }; labels: { add: string; added: string; aria: string }; className?: string }) {
  const { notify } = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={format(labels.aria, { product: product.title })}
      onClick={() => {
        quoteList.add({ productRef: product.ref, variantId: null, variantLabel: null, quantity: 1, title: product.title, href: product.href, image: product.image });
        track("add_to_quote_list", { items: [{ item_id: product.ref, item_name: product.title, quantity: 1 }] });
        notify(labels.added, "success");
        setDone(true);
        window.setTimeout(() => setDone(false), 1600);
      }}
      className={cn("relative z-10 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus", className)}
    >
      {done ? <Check aria-hidden="true" className="size-4" /> : <ShoppingCart aria-hidden="true" className="size-4" />}
      <span>{done ? labels.added : labels.add}</span>
    </button>
  );
}
