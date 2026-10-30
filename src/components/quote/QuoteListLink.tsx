"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { useQuoteList } from "@/lib/quote/store";

/** Header entry to the quote list with a live item-count badge (count of lines, not of money). */
export function QuoteListLink({ href, label }: { href: string; label: string }) {
  const lines = useQuoteList();
  const count = lines.length;
  return (
    <Link href={href} aria-label={count ? `${label} (${count})` : label} className="relative inline-flex size-12 items-center justify-center rounded-[var(--radius-md)] text-ink hover:bg-surface-2">
      <ClipboardList aria-hidden="true" className="size-5" />
      {count ? <span className="absolute end-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand-700 px-1 text-[0.6875rem] font-bold text-white">{count}</span> : null}
    </Link>
  );
}
