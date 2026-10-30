import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/** Server-rendered admin building blocks (no client JS). */

export function Card({ title, description, actions, children, className, id }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={title && id ? `${id}-title` : undefined} id={id} className={cn("min-w-0 rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6", className)}>
      {title || actions ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h2 id={id ? `${id}-title` : undefined} className="text-lg font-bold text-ink">
                {title}
              </h2>
            ) : null}
            {description ? <p className="mt-0.5 text-sm text-steel">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function KeyValues({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
          <dt className="text-steel">{k}</dt>
          <dd className="min-w-0 text-end font-medium break-words text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** GET filter bar — plain form, works without JS, keeps state in the URL (shareable, back-button friendly). */
export function FilterBar({ children, action, resetHref, label = "Filtreler" }: { children: ReactNode; action: string; resetHref: string; label?: string }) {
  return (
    <form action={action} method="get" role="search" aria-label={label} className="mb-5 flex flex-wrap items-end gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
      {children}
      <div className="flex gap-2">
        <button type="submit" className={buttonClass("primary", "md")}>
          <Search aria-hidden="true" className="size-4" /> Uygula
        </button>
        <Link href={resetHref} className={buttonClass("ghost", "md")}>
          Temizle
        </Link>
      </div>
    </form>
  );
}

export function FilterSelect({ name, label, value, options }: { name: string; label: string; value: string; options: [string, string][] }) {
  return (
    <label className="flex min-w-40 flex-col gap-1 text-xs font-semibold text-steel">
      {label}
      <select name={name} defaultValue={value} className="min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 text-sm font-normal text-ink">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterSearch({ name = "q", label = "Ara", value, placeholder }: { name?: string; label?: string; value: string; placeholder?: string }) {
  return (
    <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-semibold text-steel">
      {label}
      <input type="search" name={name} defaultValue={value} placeholder={placeholder} className="min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 text-sm font-normal text-ink" />
    </label>
  );
}

export function Pagination({ page, pages, total, href }: { page: number; pages: number; total: number; href: (p: number) => string }) {
  if (pages <= 1) return <p className="mt-3 text-xs text-steel">{total} kayıt</p>;
  return (
    <nav aria-label="Sayfalama" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-steel">
        {total} kayıt · sayfa {page}/{pages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("outline", "sm")} rel="prev">
            <ChevronLeft aria-hidden="true" className="size-4" /> Önceki
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("outline", "sm")} rel="next">
            Sonraki <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function Tabs({ items, current, label }: { items: { key: string; label: ReactNode; href: string }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 mb-6 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-line px-1">
        {items.map((t) => (
          <li key={t.key}>
            <Link href={t.href} aria-current={t.key === current ? "page" : undefined} className={cn("inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold", t.key === current ? "border-brand-700 text-brand-700 dark:border-brand-300 dark:text-brand-300" : "border-transparent text-steel hover:text-ink")}>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Honest module status shown on every screen header (İŞLEVSEL / KISMEN / HAZIRLIK / BLOKE). */
export const MODULE_STATE = {
  live: { label: "İşlevsel", cls: "bg-success-50 text-success" },
  partial: { label: "Kısmen", cls: "bg-warning-50 text-warning" },
  prep: { label: "Hazırlık", cls: "bg-surface-3 text-ink-2" },
  blocked: { label: "Bloke", cls: "bg-signal-50 text-signal-ink" },
} as const;
export function ModuleState({ state, title }: { state: keyof typeof MODULE_STATE; title?: string }) {
  const s = MODULE_STATE[state];
  return (
    <span title={title} className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase", s.cls)}>
      {s.label}
    </span>
  );
}

export function SubNav({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.href === current ? "page" : undefined} className={cn(buttonClass(i.href === current ? "primary" : "secondary", "sm"))}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}
