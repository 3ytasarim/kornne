"use client";

import Link from "next/link";
import { Mail, Menu, Phone } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { LanguageSwitcher, type LanguageOption } from "./LanguageSwitcher";
import { SearchForm } from "./SearchForm";

/** Mobile navigation drawer (native <dialog>, logical start side → slides from the right in Arabic). */
export function MobileNav({
  labels,
  links,
  categories,
  languages,
  search,
  contact,
}: {
  labels: { open: string; close: string; menu: string; categories: string; language: string };
  links: { href: string; label: string }[];
  categories: { href: string; label: string; count: string }[];
  languages: LanguageOption[];
  search: { action: string; label: string; placeholder: string; submit: string };
  contact: { phone: string; phoneHref: string; email: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={labels.open} aria-haspopup="dialog" className="inline-flex size-12 items-center justify-center rounded-[var(--radius-md)] text-ink hover:bg-surface-2 lg:hidden">
        <Menu aria-hidden="true" className="size-6" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={labels.menu} closeLabel={labels.close} variant="drawer-start">
        <div className="space-y-6 px-5 py-5">
          <SearchForm {...search} inputId="mobile-search" />
          <nav aria-label={labels.categories}>
            <p className="mb-2 text-xs font-semibold tracking-wider text-steel uppercase">{labels.categories}</p>
            <ul className="divide-y divide-line">
              {categories.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center justify-between text-base font-semibold text-ink">
                    {c.label}
                    <span className="text-xs font-medium text-steel">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ul className="divide-y divide-line border-t border-line">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center text-base font-semibold text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wider text-steel uppercase">{labels.language}</p>
            <LanguageSwitcher options={languages} label={labels.language} variant="list" />
          </div>
          <div className="space-y-1 text-sm">
            <a href={contact.phoneHref} className="flex min-h-12 items-center gap-2 text-ink">
              <Phone aria-hidden="true" className="size-4 text-brand-600" />
              <span dir="ltr">{contact.phone}</span>
            </a>
            <a href={`mailto:${contact.email}`} className="flex min-h-12 items-center gap-2 text-ink">
              <Mail aria-hidden="true" className="size-4 text-brand-600" />
              {contact.email}
            </a>
          </div>
        </div>
      </Dialog>
    </>
  );
}
