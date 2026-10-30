import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/** Crawlable pagination: real <a> links to unique URLs (/kategori/x, /kategori/x/2). */
export function Pagination({ page, pages, hrefFor, labels }: { page: number; pages: number; hrefFor: (n: number) => string; labels: { nav: string; prev: string; next: string; pageOf: string } }) {
  if (pages <= 1) return null;
  const item = "inline-flex min-h-12 min-w-12 items-center justify-center rounded-[var(--radius-md)] border text-sm font-semibold";
  return (
    <nav aria-label={labels.nav} className="mt-10 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" aria-label={labels.prev} className={cn(item, "border-line hover:border-brand-600")}>
          <ChevronLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </Link>
      ) : null}
      <ul className="flex items-center gap-2">
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <Link href={hrefFor(n)} aria-current={n === page ? "page" : undefined} className={cn(item, n === page ? "border-brand-700 bg-brand-700 text-white" : "border-line hover:border-brand-600")}>
              {n}
            </Link>
          </li>
        ))}
      </ul>
      {page < pages ? (
        <Link href={hrefFor(page + 1)} rel="next" aria-label={labels.next} className={cn(item, "border-line hover:border-brand-600")}>
          <ChevronRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </Link>
      ) : null}
      <span className="sr-only">{labels.pageOf}</span>
    </nav>
  );
}
