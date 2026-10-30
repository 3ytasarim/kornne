import { ConsentReopenButton } from "@/components/analytics/AnalyticsRoot";
import { analyticsConfig } from "@/lib/analytics/config";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { SITE } from "@/config/site";
import { catalog } from "@/lib/catalog";
import { getContact, getMenu, hasMenus, type MenuLink } from "@/lib/cms/store";
import { getI18n } from "@/lib/i18n/server";

export async function SiteFooter({ localeParam }: { localeParam: string }) {
  const { locale, d, href } = getI18n(localeParam);
  const contact = await getContact();
  const categories = await catalog.listCategories(locale);
  const year = new Date().getFullYear();
  // Legal texts exist only in Turkish on the source site and are pending legal approval (Sprint 7)
  // Admin › İçerik › Menü (FOOTER_CORPORATE + FOOTER_LEGAL); static fallback only while no menu rows exist
  const categorySlugs = Object.fromEntries(categories.map((c) => [c.key, c.slug]));
  const links: MenuLink[] = (await hasMenus())
    ? [...(await getMenu(locale, "FOOTER_CORPORATE", categorySlugs)), ...(await getMenu(locale, "FOOTER_LEGAL", categorySlugs))]
    : [
        { label: d.nav.corporate, href: href("/sayfa/kurumsal") },
        { label: d.footer.returns, href: "/sayfa/iade-ve-geri-odeme-politikalari", hrefLang: "tr" },
        { label: d.footer.distanceSales, href: "/sayfa/mesafeli-satis-sozlesmesi", hrefLang: "tr" },
        { label: d.footer.kvkk, href: "/sayfa/kisisel-verilenin-korunmasi-kanunu", hrefLang: "tr" },
      ];

  return (
    <footer className="mt-24 bg-brand-950 text-white/80">
      <div className="container-site grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.2fr]">
        <div className="min-w-0 space-y-4">
          <Image src={SITE.wordmark.srcWhite} alt={SITE.name} width={SITE.wordmark.width} height={SITE.wordmark.height} sizes="180px" className="h-12 w-auto" />
          <p className="max-w-xs text-sm leading-relaxed">{d.meta.tagline}</p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {[d.shop.utility.transfer, d.shop.utility.vat].map((x) => (
              <li key={x} className="rounded-full bg-white/10 px-3 py-1.5 text-white/85">
                {x}
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-2" aria-label={d.footer.follow}>
            {contact.social.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-4 text-sm hover:border-white hover:text-white">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <nav aria-label={d.nav.categories}>
          <p className="mb-3 text-xs font-semibold tracking-widest text-white uppercase">{d.nav.categories}</p>
          <ul className="space-y-1">
            {categories.map((c) => (
              <li key={c.key}>
                <Link href={href(`/kategori/${c.slug}`)} className="inline-flex min-h-10 items-center text-sm hover:text-white">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={d.footer.legal} className="space-y-8">
          <div>
          <p className="mb-3 text-xs font-semibold tracking-widest text-white uppercase">{d.nav.orderStatus}</p>
          <ul className="space-y-1">
            {[
              { href: href("/sepetim"), label: d.nav.cart },
              { href: href("/siparisim-ne-durumda"), label: d.nav.orderStatus },
              { href: href("/odeme-bildirimi"), label: d.nav.paymentNotice },
              { href: href("/banka-hesaplari"), label: d.nav.bankAccounts },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="inline-flex min-h-10 items-center text-sm hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          </div>
          <div>
          <p className="mb-3 text-xs font-semibold tracking-widest text-white uppercase">{d.footer.legal}</p>
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={l.href + l.label}>
                {l.external ? (
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-sm hover:text-white">
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} hrefLang={l.hrefLang} className="inline-flex min-h-10 items-center text-sm hover:text-white">
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          </div>
        </nav>

        <address className="space-y-3 text-sm not-italic">
          <p className="mb-3 text-xs font-semibold tracking-widest text-white uppercase">{d.nav.contact}</p>
          <a href={`tel:${contact.phoneE164}`} className="flex min-h-10 items-center gap-2 hover:text-white">
            <Phone aria-hidden="true" className="size-4 shrink-0" />
            <span dir="ltr">{contact.phoneDisplay}</span>
          </a>
          <a href={`mailto:${contact.email}`} className="flex min-h-10 items-center gap-2 hover:text-white">
            <Mail aria-hidden="true" className="size-4 shrink-0" />
            {contact.email}
          </a>
          <p className="flex gap-2">
            <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {contact.address}
            </span>
          </p>
        </address>
      </div>
      <div className="border-t border-white/10">
        {/* bottom/end padding keeps the floating WhatsApp button (fixed, bottom-right) from covering the credit */}
        <div className="container-site flex flex-col items-center gap-3 pt-5 pb-24 text-center sm:flex-row sm:justify-between sm:pb-5 sm:text-start sm:pe-24 lg:pe-28">
          <p className="text-xs text-white/60">
            © {year} {SITE.name}. {d.footer.rights}
            {analyticsConfig().enabled ? (
              <>
                {" · "}
                <ConsentReopenButton label={d.consent.reopen} />
              </>
            ) : null}
          </p>
          {/* agency credit */}
          <a href="https://www.3ytasarim.com" target="_blank" rel="noopener" className="kn-credit group inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs text-white/70 transition-[border-color,background-color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] motion-reduce:hover:translate-y-0">
            <span aria-hidden="true" className="kn-credit-dot relative inline-flex size-2 rounded-full bg-gradient-to-br from-sky-400 to-fuchsia-400" />
            <span>Design by</span>
            <span className="kn-credit-name relative font-semibold">
              3Y Tasarım &amp; Yazılım Hizmetleri
              <span aria-hidden="true" className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-gradient-to-r from-sky-400 via-white to-fuchsia-400 transition-transform duration-500 ease-[var(--ease-premium)] group-hover:scale-x-100 rtl:origin-right" />
            </span>
            <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-60 transition-[transform,opacity] duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 rtl:-scale-x-100" />
          </a>
        </div>
      </div>
    </footer>
  );
}
