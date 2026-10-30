import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/seo/json-ld";

/** Visible breadcrumb; the SAME items feed BreadcrumbList JSON-LD (Bifire Breadcrumbs.tsx, RTL-aware chevron). */
export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8125rem] text-steel">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-1.5">
              {last ? (
                <span aria-current="page" className="line-clamp-1 font-medium text-ink">
                  {c.name}
                </span>
              ) : (
                <>
                  <Link href={c.path} className="inline-flex min-h-8 items-center hover:text-brand-600">
                    {c.name}
                  </Link>
                  <ChevronRight aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
