import { ConsentReopenButton } from "@/components/analytics/AnalyticsRoot";
import { analyticsConfig } from "@/lib/analytics/config";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { SocialIcon } from "@/components/layout/SocialIcon";
import { whatsappHref, WhatsAppIcon } from "@/components/layout/WhatsAppCta";
import { ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { SITE } from "@/config/site";
import { catalog } from "@/lib/catalog";
import { getContact, getMenu, hasMenus, type MenuLink } from "@/lib/cms/store";
import { getI18n } from "@/lib/i18n/server";

const linkClass = "group inline-flex min-h-10 items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white";
const headingClass = "mb-4 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-white uppercase before:h-px before:w-4 before:bg-sky-400/80";

function FooterLink({ l }: { l: MenuLink }) {
  const inner = (
    <>
      <span className="transition-transform duration-300 ease-[var(--ease-premium)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5">{l.label}</span>
    </>
  );
  return l.external ? (
    <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {inner}
    </a>
  ) : (
    <Link href={l.href} hrefLang={l.hrefLang} className={linkClass}>
      {inner}
    </Link>
  );
}

export async function SiteFooter({ localeParam }: { localeParam: string }) {
  const { locale, d, href, t } = getI18n(localeParam);
  const contact = await getContact();
  const categories = await catalog.listCategories(locale);
  const year = new Date().getFullYear();
  // Admin › İçerik › Menü (FOOTER_CORPORATE + FOOTER_LEGAL); static fallback only while no menu rows exist
  const categorySlugs = Object.fromEntries(categories.map((c) => [c.key, c.slug]));
  const links: MenuLink[] = (await hasMenus())
    ? [...(await getMenu(locale, "FOOTER_CORPORATE", categorySlugs)), ...(await getMenu(locale, "FOOTER_LEGAL", categorySlugs))]
    : [
        { label: d.nav.corporate, href: href("/sayfa/kurumsal") },
        { label: d.footer.returns, href: "/tr/sayfa/iade-ve-geri-odeme-politikalari", hrefLang: "tr" },
        { label: d.footer.distanceSales, href: "/tr/sayfa/mesafeli-satis-sozlesmesi", hrefLang: "tr" },
        { label: d.footer.kvkk, href: "/tr/sayfa/kisisel-verilenin-korunmasi-kanunu", hrefLang: "tr" },
      ];
  const orderLinks: MenuLink[] = [
    { href: href("/sepetim"), label: d.nav.cart },
    { href: href("/siparisim-ne-durumda"), label: d.nav.orderStatus },
    { href: href("/odeme-bildirimi"), label: d.nav.paymentNotice },
    { href: href("/banka-hesaplari"), label: d.nav.bankAccounts },
  ];

  return (
    <footer className="relative mt-24 overflow-hidden bg-brand-950 text-white/80">
      {/* soft light from the top edge — depth without patterns */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-80 max-w-4xl rounded-full bg-sky-500/10 blur-3xl" />

      {/* call to action card */}
      <div className="container-site relative pt-14">
        <div className="flex flex-col gap-6 rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-6 sm:p-8 md:flex-row md:items-center md:justify-between md:p-10">
          <div className="max-w-xl space-y-2">
            <p className="font-display text-2xl font-bold text-balance text-white md:text-[1.75rem]">{d.footerCta.title}</p>
            <p className="text-white/65">{d.footerCta.text}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonAnchor href={whatsappHref(t(d.product.whatsappMessage, { url: SITE.name }), contact.whatsapp)} variant="whatsapp" icon={<WhatsAppIcon className="size-5" />}>
              {d.contact.whatsapp}
            </ButtonAnchor>
            <ButtonLink href={href("/iletisim")} variant="light" iconEnd={<ArrowUpRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />}>
              {d.nav.contact}
            </ButtonLink>
          </div>
        </div>
      </div>

      <div className="container-site relative grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.45fr_1fr_1fr_1fr_1.25fr] lg:gap-8">
        <div className="min-w-0 space-y-5 sm:col-span-2 lg:col-span-1">
          <Image src={SITE.wordmark.srcWhite} alt={SITE.name} width={SITE.wordmark.width} height={SITE.wordmark.height} sizes="180px" className="h-12 w-auto" />
          <p className="max-w-xs text-sm leading-relaxed text-white/70">{d.meta.tagline}</p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {[d.shop.utility.transfer, d.shop.utility.vat].filter(Boolean).map((x) => (
              <li key={x} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/80">
                {x}
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-2" aria-label={d.footer.follow}>
            {contact.social.map((s) => (
              <li key={s.name}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.name}
                  title={s.name}
                  className="inline-flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/80 transition-[background-color,border-color,color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/40 hover:bg-white/10 hover:text-white motion-reduce:hover:translate-y-0"
                >
                  <SocialIcon name={s.name} />
                </a>
              </li>
            ))}
          </ul>
          {/* iyzico requires this band on the site before it activates the merchant account, so it shows regardless of card payment;
              the logos are dark on a transparent background, so they sit on a light strip to stay legible on the dark footer */}
          <div className="w-full max-w-[340px] rounded-2xl bg-white px-4 py-2.5 shadow-[0_8px_24px_-12px_rgb(0_0_0/0.5)]">
            <Image src="/payments/iyzico-logo-band.png" alt={d.footer.paymentLogos} width={429} height={32} sizes="340px" className="h-auto w-full" />
          </div>
        </div>

        <nav aria-label={d.nav.categories} className="min-w-0">
          <p className={headingClass}>{d.nav.categories}</p>
          <ul className="space-y-0.5">
            {categories.map((c) => (
              <li key={c.key}>
                <FooterLink l={{ href: href(`/kategori/${c.slug}`), label: c.name }} />
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={d.nav.orderStatus} className="min-w-0">
          <p className={headingClass}>{d.nav.orderStatus}</p>
          <ul className="space-y-0.5">
            {orderLinks.map((l) => (
              <li key={l.href}>
                <FooterLink l={l} />
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label={d.footer.legal} className="min-w-0">
          <p className={headingClass}>{d.footer.legal}</p>
          <ul className="space-y-0.5">
            {links.map((l) => (
              <li key={l.href + l.label}>
                <FooterLink l={l} />
              </li>
            ))}
          </ul>
        </nav>

        <address className="min-w-0 text-sm not-italic">
          <p className={headingClass}>{d.nav.contact}</p>
          <ul className="space-y-3">
            <li>
              <a href={`tel:${contact.phoneE164}`} className="group flex min-h-10 items-center gap-3 text-white/80 hover:text-white">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 transition-colors group-hover:bg-white/10">
                  <Phone aria-hidden="true" className="size-4" />
                </span>
                <span dir="ltr">{contact.phoneDisplay}</span>
              </a>
            </li>
            <li>
              <a href={`mailto:${contact.email}`} className="group flex min-h-10 items-center gap-3 text-white/80 hover:text-white">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 transition-colors group-hover:bg-white/10">
                  <Mail aria-hidden="true" className="size-4" />
                </span>
                <span className="[overflow-wrap:anywhere]">{contact.email}</span>
              </a>
            </li>
            <li className="flex gap-3 text-white/70">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                <MapPin aria-hidden="true" className="size-4" />
              </span>
              <span className="pt-1.5 leading-relaxed">{contact.address}</span>
            </li>
          </ul>
        </address>
      </div>

      <div className="relative border-t border-white/10">
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
