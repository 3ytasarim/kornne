"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useQuoteList } from "@/lib/quote/store";

/** Header cart entry: icon + label (desktop) + live line-count badge. The basket is the shared quote/cart list. */
export function CartLink({ href, label }: { href: string; label: string }) {
  const count = useQuoteList().length;
  return (
    <Link href={href} className="relative inline-flex min-h-12 items-center gap-2 rounded-full bg-brand-700 ps-3.5 pe-4 text-sm font-semibold text-white transition-colors hover:bg-brand-800 max-sm:size-12 max-sm:justify-center max-sm:p-0">
      <ShoppingCart aria-hidden="true" className="size-5" />
      <span className="sr-only sm:not-sr-only">{label}</span>
      {count ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1 text-[0.6875rem] font-bold text-brand-800 tabular-nums max-sm:absolute max-sm:-end-0.5 max-sm:-top-0.5 max-sm:ring-2 max-sm:ring-surface">{count}</span> : null}
    </Link>
  );
}
