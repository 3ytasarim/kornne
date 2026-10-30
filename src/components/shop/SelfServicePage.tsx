import Link from "next/link";
import type { ReactNode } from "react";
import { Landmark, Mail, PackageSearch, Phone, ReceiptText } from "lucide-react";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { getContact } from "@/lib/cms/store";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/cn";

type Key = "status" | "notice" | "banks";

/** Shared frame of the order self-service pages (legacy paths): title, lead, sibling tabs and a help card. */
export async function SelfServicePage({ localeParam, current, title, lead, children }: { localeParam: string; current: Key; title: string; lead: string; children: ReactNode }) {
  const { d, href } = getI18n(localeParam);
  const contact = await getContact();
  const tabs: { key: Key; href: string; label: string; icon: typeof Landmark }[] = [
    { key: "status", href: href("/siparisim-ne-durumda"), label: d.nav.orderStatus, icon: PackageSearch },
    { key: "notice", href: href("/odeme-bildirimi"), label: d.nav.paymentNotice, icon: ReceiptText },
    { key: "banks", href: href("/banka-hesaplari"), label: d.nav.bankAccounts, icon: Landmark },
  ];
  const self = tabs.find((t) => t.key === current)!;
  return (
    <div className="container-site py-8 md:py-12">
      <Breadcrumbs items={[{ name: d.nav.home, path: href("/") }, { name: self.label, path: self.href }]} label={d.a11y.breadcrumb} />
      <header className="mt-6 mb-8 max-w-3xl">
        <h1 className="font-display text-h1 font-bold text-ink">{title}</h1>
        <p className="mt-3 text-steel">{lead}</p>
      </header>
      <nav aria-label={d.nav.orderStatus} className="mb-8 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors", t.key === current ? "border-brand-700 bg-brand-700 text-white" : "border-line text-ink-2 hover:border-line-strong hover:text-ink")}>
            <t.icon aria-hidden="true" className="size-4" />
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">{children}</div>
        <aside className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-6">
          <p className="font-semibold text-ink">{d.shop.help.title}</p>
          <p className="mt-1 text-sm text-steel">{d.shop.help.text}</p>
          <a href={`tel:${contact.phoneE164}`} className="mt-4 flex min-h-11 items-center gap-2 font-semibold text-ink hover:text-brand-700">
            <Phone aria-hidden="true" className="size-4" />
            <span dir="ltr">{contact.phoneDisplay}</span>
          </a>
          <a href={`mailto:${contact.email}`} className="flex min-h-11 items-center gap-2 text-sm text-ink-2 hover:text-brand-700">
            <Mail aria-hidden="true" className="size-4" />
            {contact.email}
          </a>
        </aside>
      </div>
    </div>
  );
}
