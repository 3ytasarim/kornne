"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BadgeTurkishLira, Boxes, ClipboardCheck, ExternalLink, FileText, FolderTree, Gauge, Images, Languages, LogOut, Menu, MessagesSquare, Package, Route, ScrollText, Search, ChartLine, Landmark, Settings, ShoppingBag, Store, UserCog, Users, X } from "lucide-react";
import { logoutAction } from "@/app/admin/login/actions";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/cn";
import type { NavItem } from "./adminNav";

/**
 * Admin shell — adapted from Bifire src/components/admin/AdminShell.tsx (own code): grouped sidebar filtered by the
 * user's RBAC modules, mobile panel that closes on navigation, aria-current. Rebranded, KORNNE tokens.
 */
const ICONS = { Gauge, Package, FolderTree, ClipboardCheck, BadgeTurkishLira, Boxes, Images, ShoppingBag, MessagesSquare, Users, FileText, Languages, Search, Route, Store, Settings, UserCog, ScrollText, ChartLine, Landmark } as const;

export function AdminShell({ user, nav, children }: { user: { name: string; email: string; roleLabel: string }; nav: { group: string; items: NavItem[] }[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const navEl = (
    <nav aria-label="Yönetim menüsü" className="flex-1 overflow-y-auto px-3 py-4">
      {nav.map((g) => (
        <div key={g.group} className="mb-5">
          <p className="px-3 text-[11px] font-semibold tracking-[0.18em] text-white/70 uppercase">{g.group}</p>
          <ul className="mt-2 space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon as keyof typeof ICONS] ?? Gauge;
              const active = isActive(it.href);
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm transition-colors", active ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/6 hover:text-white")}>
                    <Icon aria-hidden="true" className={cn("size-4", active && "text-silver")} />
                    <span className="flex-1">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 p-4">
      <p className="truncate text-sm font-medium text-white">{user.name}</p>
      <p className="truncate text-xs text-white/55">
        {user.email} · {user.roleLabel}
      </p>
      <div className="mt-3 flex gap-2">
        <a href="/" target="_blank" rel="noopener" className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-white/15 text-xs text-white/80 hover:text-white">
          <ExternalLink aria-hidden="true" className="size-3.5" /> Siteyi aç
        </a>
        <form action={logoutAction} className="flex-1">
          <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-white/15 text-xs text-white/80 hover:text-white">
            <LogOut aria-hidden="true" className="size-3.5" /> Çıkış
          </button>
        </form>
      </div>
    </div>
  );

  const brand = (
    <Link href="/admin" className="flex items-center gap-2.5 font-display font-bold tracking-[0.2em] text-white">
      <span className="inline-flex rounded-full bg-white p-0.5">
        <Image src="/brand/kornne-logo.png" alt="" width={32} height={32} className="size-8" />
      </span>
      KORNNE
    </Link>
  );

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col bg-brand-950 lg:flex">
        <div className="flex h-16 items-center px-5">{brand}</div>
        {navEl}
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-brand-950 px-4 text-white lg:hidden">
        {brand}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="admin-mobile-nav" aria-label={open ? "Menüyü kapat" : "Menüyü aç"} className="flex size-12 items-center justify-center">
          {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
        </button>
      </header>
      {open ? (
        <div id="admin-mobile-nav" className="fixed inset-x-0 top-14 bottom-0 z-30 flex flex-col bg-brand-950 lg:hidden">
          {navEl}
          {footer}
        </div>
      ) : null}

      <div className="min-w-0">
        <div className="hidden h-16 items-center justify-end gap-2 border-b border-line bg-surface px-8 lg:flex">
          <ThemeToggle labels={{ dark: "Koyu tema", light: "Açık tema" }} />
        </div>
        <main id="main" className="px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
