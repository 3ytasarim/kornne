"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Products mega menu. Interaction model adapted from BiciriklarKids src/components/layout/DesktopNav.tsx (own code):
 * opens on click and on hover-with-delay, Esc closes and returns focus to the trigger, outside pointer closes,
 * focus leaving the panel closes. Rebuilt with logical (RTL-safe) spacing and KORNNE tokens.
 */
export type MegaCategory = { key: string; name: string; href: string; count: string; products: { title: string; href: string; hrefLang: string | null; image: string | null }[] };

export function MegaMenu({ label, categories, viewAllLabel, viewAllHref }: { label: string; categories: MegaCategory[]; viewAllLabel: string; viewAllHref: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const panelId = useId();

  const close = useCallback((focusTrigger = false) => {
    // a pending hover-open must not re-open the menu right after Esc / outside click (race seen in Firefox, Sprint 10)
    window.clearTimeout(timer.current);
    setOpen(false);
    if (focusTrigger) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && close();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  const hover = (next: boolean) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), next ? 120 : 220);
  };
  const cat = categories[active];

  return (
    <div
      ref={wrap}
      className="static"
      onPointerEnter={(e) => e.pointerType === "mouse" && hover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && hover(false)}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => {
          window.clearTimeout(timer.current);
          setOpen((v) => !v);
        }} className="inline-flex min-h-12 items-center gap-1 rounded-[var(--radius-md)] px-3 text-[0.9375rem] font-semibold text-ink hover:bg-surface-2">
        {label}
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>

      <div id={panelId} hidden={!open} className="absolute inset-x-0 top-full z-40 border-t border-line bg-surface shadow-[var(--shadow-pop)]">
        <div className="container-site grid grid-cols-[18rem_1fr] gap-8 py-8">
          <ul className="space-y-1 border-e border-line pe-6">
            {categories.map((c, i) => (
              <li key={c.key}>
                <Link
                  href={c.href}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => close()}
                  className={cn("flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 text-[0.9375rem] font-semibold", i === active ? "bg-brand-50 text-brand-800 dark:text-brand-300" : "text-ink hover:bg-surface-2")}
                >
                  <span>{c.name}</span>
                  <span className="text-xs font-medium text-steel">{c.count}</span>
                </Link>
              </li>
            ))}
            <li className="pt-3">
              <Link href={viewAllHref} onClick={() => close()} className="inline-flex min-h-12 items-center gap-2 px-3 text-sm font-semibold text-brand-600 hover:underline">
                {viewAllLabel}
                <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
              </Link>
            </li>
          </ul>
          {cat ? (
            <ul className="grid grid-cols-3 gap-4 xl:grid-cols-4" aria-label={cat.name}>
              {cat.products.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} hrefLang={p.hrefLang ?? undefined} onClick={() => close()} className="group block rounded-[var(--radius-md)] p-2 hover:bg-surface-2">
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-[var(--radius-sm)] bg-surface-2">
                      {p.image ? <Image src={p.image} alt="" fill sizes="200px" className="object-contain p-2 transition-transform duration-300 group-hover:scale-105" /> : null}
                    </span>
                    <span className="mt-2 line-clamp-2 block text-sm font-semibold text-ink" lang={p.hrefLang ?? undefined}>
                      {p.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
