import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

/** GET search form → server-rendered results page (works without JS; SearchAction target in JSON-LD). */
export function SearchForm({ action, label, placeholder, submit, defaultValue, className, inputId = "site-search" }: { action: string; label: string; placeholder: string; submit: string; defaultValue?: string; className?: string; inputId?: string }) {
  return (
    <form action={action} method="get" role="search" className={cn("relative", className)}>
      <label className="sr-only" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        maxLength={80}
        className="block min-h-12 w-full rounded-full border border-line-strong bg-surface-2 ps-11 pe-24 text-[0.9375rem] text-ink placeholder:text-steel focus:border-brand-600 focus:bg-surface focus:outline-none"
      />
      <Search aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-steel" />
      <button type="submit" className="absolute end-1.5 top-1/2 inline-flex min-h-9 -translate-y-1/2 items-center rounded-full bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
        {submit}
      </button>
    </form>
  );
}
