"use client";

import { Check } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { Flag } from "./Flag";

/**
 * Language switcher. Targets come from the page's own hreflang alternates (passed as props), so each entry points to
 * the equivalent page — never a page that does not exist in that language (falls back to that locale's home).
 * Uses plain <a> (full navigation) so <html lang/dir> and fonts switch cleanly. Adapted from
 * Mezbaha-Teknolojileri src/components/i18n/language-switcher.tsx (Esc/outside-click close, hrefLang).
 */
export type LanguageOption = { locale: string; label: string; nativeName: string; href: string; current: boolean };

/** Page-level equivalents: rendered by <PageLanguageLinks> (includes pages that exist but are noindex, e.g. untranslated). */
const LINKS_ID = "kornne-lang-links";

// Read once per navigation from the DOM (external store); the server snapshot keeps the locale-home fallbacks.
function readLinks(): string {
  const el = document.getElementById(LINKS_ID);
  if (el?.textContent) return el.textContent;
  const map: Record<string, string> = {};
  document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]').forEach((l) => {
    if (l.hreflang !== "x-default") map[l.hreflang] = new URL(l.href).pathname;
  });
  return JSON.stringify(map);
}
function subscribeLinks(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}

export function LanguageSwitcher({ options: initial, label, variant = "header" }: { options: LanguageOption[]; label: string; variant?: "header" | "list" | "flags" }) {
  const raw = useSyncExternalStore(subscribeLinks, readLinks, () => "{}");
  const options = useMemo(() => {
    let map: Record<string, string> = {};
    try {
      map = JSON.parse(raw) as Record<string, string>;
    } catch {
      map = {};
    }
    return initial.map((o) => (map[o.locale] ? { ...o, href: map[o.locale]! } : o));
  }, [raw, initial]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const current = options.find((o) => o.current);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (variant === "flags") {
    return (
      <nav aria-label={label}>
        <ul className="flex items-center gap-0.5">
          {options.map((o) => (
            <li key={o.locale}>
              <a href={o.href} hrefLang={o.locale} lang={o.locale} aria-current={o.current ? "true" : undefined} aria-label={`${o.label} — ${o.nativeName}`} title={o.nativeName} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded px-1.5 text-xs font-semibold transition-opacity", o.current ? "text-white" : "text-white/70 opacity-80 hover:text-white hover:opacity-100")}>
                <Flag locale={o.locale} className={o.current ? "ring-2 ring-white/70" : undefined} />
                <span aria-hidden="true" className="hidden lg:inline">{o.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  if (variant === "list") {
    return (
      <nav aria-label={label}>
        <ul className="grid grid-cols-5 gap-2">
          {options.map((o) => (
            <li key={o.locale}>
              <a href={o.href} hrefLang={o.locale} lang={o.locale} aria-current={o.current ? "true" : undefined} className={cn("flex min-h-12 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border text-sm font-semibold", o.current ? "border-brand-700 bg-brand-700 text-white" : "border-line text-ink hover:border-brand-600")}>
                <Flag locale={o.locale} />
                {o.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button ref={btnRef} type="button" aria-expanded={open} aria-controls={menuId} aria-label={`${current?.label ?? ""} — ${label}: ${current?.nativeName ?? ""}`} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-12 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-sm font-semibold text-ink hover:bg-surface-2">
        {current ? <Flag locale={current.locale} /> : null}
        {current?.label}
      </button>
      <ul id={menuId} hidden={!open} className="absolute end-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface py-1 shadow-[var(--shadow-pop)]">
        {options.map((o) => (
          <li key={o.locale}>
            <a href={o.href} hrefLang={o.locale} lang={o.locale} aria-current={o.current ? "true" : undefined} className="flex min-h-11 items-center justify-between gap-3 px-4 text-sm text-ink hover:bg-surface-2">
              <span className="inline-flex items-center gap-2.5">
                <Flag locale={o.locale} />
                {o.nativeName}
              </span>
              {o.current ? <Check aria-hidden="true" className="size-4 text-brand-600" /> : <span className="text-xs text-steel">{o.label}</span>}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
