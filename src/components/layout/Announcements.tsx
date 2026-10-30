import Link from "next/link";
import { ArrowRight, Megaphone } from "lucide-react";
import { getActiveBanners } from "@/lib/cms/store";
import type { Locale } from "@/lib/i18n/config";

/**
 * CMS announcements (Admin › İçerik › Duyuru). Rendered only while PUBLISHED and inside their start/end window, and
 * only in languages that have their own text — nothing renders when there is no active announcement.
 */
export async function TopAnnouncement({ locale, label }: { locale: Locale; label: string }) {
  const items = await getActiveBanners(locale, "TOPBAR").catch(() => []);
  const b = items[0];
  if (!b) return null;
  const body = (
    <>
      <Megaphone aria-hidden="true" className="size-4 shrink-0" />
      <span className="font-semibold">{b.title}</span>
      {b.text ? <span className="hidden opacity-90 sm:inline">— {b.text}</span> : null}
      {b.href ? <ArrowRight aria-hidden="true" className="size-4 shrink-0 rtl:rotate-180" /> : null}
    </>
  );
  return (
    <aside aria-label={label} className="bg-brand-700 text-white">
      <div className="container-site flex min-h-10 items-center justify-center gap-2 py-1.5 text-center text-sm">
        {b.href ? (
          b.external ? (
            <a href={b.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 hover:underline">
              {body}
            </a>
          ) : (
            <Link href={b.href} className="inline-flex min-h-9 items-center gap-2 hover:underline">
              {body}
            </Link>
          )
        ) : (
          <p className="inline-flex items-center gap-2">{body}</p>
        )}
      </div>
    </aside>
  );
}

export async function HomeAnnouncements({ locale, label }: { locale: Locale; label: string }) {
  const items = await getActiveBanners(locale, "HOME_STRIP").catch(() => []);
  if (!items.length) return null;
  return (
    <section aria-label={label} className="container-site pt-8">
      <ul className="grid gap-3 md:grid-cols-2">
        {items.slice(0, 2).map((b) => (
          <li key={b.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-brand-200 bg-brand-50 p-5 dark:border-brand-800 dark:bg-brand-950/40">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold text-ink">{b.title}</p>
              {b.text ? <p className="mt-1 text-sm text-steel">{b.text}</p> : null}
            </div>
            {b.href && b.ctaLabel ? (
              b.external ? (
                <a href={b.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800">
                  {b.ctaLabel}
                </a>
              ) : (
                <Link href={b.href} className="inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-md)] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800">
                  {b.ctaLabel} <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
                </Link>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
