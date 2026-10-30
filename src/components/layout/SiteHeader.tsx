import Image from "next/image";
import Link from "next/link";
import { Landmark, PackageSearch, Percent, Phone, ReceiptText } from "lucide-react";
import { SITE } from "@/config/site";
import { catalog } from "@/lib/catalog";
import { productHref } from "@/lib/catalog/cards";
import { ENABLED_LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";
import { LanguageSwitcher, type LanguageOption } from "./LanguageSwitcher";
import { MegaMenu } from "./MegaMenu";
import { MobileNav } from "./MobileNav";
import { SearchForm } from "./SearchForm";
import { ThemeToggle } from "./ThemeToggle";
import { getContact, getMenu, hasMenus } from "@/lib/cms/store";
import { CartLink } from "@/components/shop/CartLink";

export function languageOptions(current: Locale): LanguageOption[] {
  return ENABLED_LOCALES.map((l) => ({ locale: l, label: LOCALE_META[l].label, nativeName: LOCALE_META[l].nativeName, href: l === "tr" ? "/" : `/${l}`, current: l === current }));
}

export async function SiteHeader({ localeParam }: { localeParam: string }) {
  const { locale, d, href, t } = getI18n(localeParam);
  const contact = await getContact();
  const categories = await catalog.listCategories(locale);
  const products = await catalog.listProducts(locale);
  const real = categories.filter((c) => !c.isAllProducts);
  const all = categories.find((c) => c.isAllProducts);
  const catHref = (slug: string) => href(`/kategori/${slug}`);
  const mega = real.map((c) => ({
    key: c.key,
    name: c.name,
    href: catHref(c.slug),
    count: t(d.category.productCount, { count: c.productCount }),
    products: products
      .filter((p) => p.primaryCategoryKey === c.key || p.categoryKeys.includes(c.key))
      .slice(0, 8)
      .map((p) => ({ title: p.title, href: productHref(p), hrefLang: p.pageLocale !== locale ? p.pageLocale : null, image: p.images[0]?.src ?? null })),
  }));
  const search = { action: href("/arama"), label: d.search.label, placeholder: d.search.placeholder, submit: d.search.submit };
  const languages = languageOptions(locale);
  // Admin › İçerik › Menü (HEADER); static fallback only while no menu rows exist
  const navLinks = (await hasMenus())
    ? await getMenu(locale, "HEADER", Object.fromEntries(categories.map((c) => [c.key, c.slug])))
    : [
        { href: href("/sayfa/kurumsal"), label: d.nav.corporate },
        { href: href("/iletisim"), label: d.nav.contact },
      ];

  const utility = [
    { href: href("/siparisim-ne-durumda"), label: d.nav.orderStatus, icon: PackageSearch },
    { href: href("/odeme-bildirimi"), label: d.nav.paymentNotice, icon: ReceiptText },
    { href: href("/banka-hesaplari"), label: d.nav.bankAccounts, icon: Landmark },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      {/* utility bar: B2B promise + order self-service (legacy kornne.com paths) */}
      <div className="hidden bg-brand-950 text-white/80 md:block">
        <div className="container-site flex min-h-9 items-center justify-between gap-6 text-[0.8125rem]">
          <ul className="flex min-w-0 items-center gap-5 overflow-hidden whitespace-nowrap">
            <li className="inline-flex items-center gap-1.5">
              <Landmark aria-hidden="true" className="size-3.5" />
              {d.shop.utility.transfer}
            </li>
            <li className="hidden items-center gap-1.5 xl:inline-flex">
              <Percent aria-hidden="true" className="size-3.5" />
              {d.shop.utility.vat}
            </li>
          </ul>
          <nav aria-label={d.nav.orderStatus} className="flex shrink-0 items-center gap-1">
            {utility.map((u) => (
              <Link key={u.href} href={u.href} className="inline-flex min-h-9 items-center gap-1.5 rounded px-2 hover:text-white">
                <u.icon aria-hidden="true" className="size-3.5" />
                <span className="sr-only xl:not-sr-only">{u.label}</span>
              </Link>
            ))}
            <span className="ms-2 border-s border-white/15 ps-2">
              <LanguageSwitcher options={languages} label={d.a11y.languageSwitcher} variant="flags" />
            </span>
            <a href={`tel:${contact.phoneE164}`} className="ms-2 inline-flex min-h-9 items-center gap-1.5 border-s border-white/15 ps-3 font-semibold text-white">
              <Phone aria-hidden="true" className="size-3.5" />
              <span dir="ltr">{contact.phoneDisplay}</span>
            </a>
          </nav>
        </div>
      </div>

      <div className="container-site flex min-h-16 items-center gap-2 sm:gap-3 lg:min-h-[4.75rem] lg:gap-8">
        <MobileNav
          labels={{ open: d.a11y.openMenu, close: d.a11y.closeMenu, menu: d.nav.products, categories: d.nav.categories, language: d.a11y.languageSwitcher }}
          links={[{ href: href("/"), label: d.nav.home }, ...navLinks.map((l) => ({ href: l.href, label: l.label })), ...utility.map((u) => ({ href: u.href, label: u.label }))]}
          categories={categories.map((c) => ({ href: catHref(c.slug), label: c.name, count: t(d.category.productCount, { count: c.productCount }) }))}
          languages={languages}
          search={search}
          contact={{ phone: contact.phoneDisplay, phoneHref: `tel:${contact.phoneE164}`, email: contact.email }}
        />

        {/* client wordmark: ~30px tall on phones, 44px on desktop (never a tiny badge, never oversized) */}
        <Link href={href("/")} className="flex shrink-0 items-center" aria-label={`${SITE.name} — ${d.nav.home}`}>
          <Image src={SITE.wordmark.src} alt="" width={SITE.wordmark.width} height={SITE.wordmark.height} priority sizes="(min-width:1024px) 180px, 135px" className="h-[34px] w-auto min-[400px]:h-9 lg:h-12 dark:hidden" />
          <Image src={SITE.wordmark.srcWhite} alt="" width={SITE.wordmark.width} height={SITE.wordmark.height} sizes="(min-width:1024px) 180px, 135px" className="hidden h-[34px] w-auto min-[400px]:h-9 lg:h-12 dark:block" />
        </Link>

        <SearchForm {...search} className="hidden w-full max-w-xl flex-1 md:block" />

        <div className="ms-auto flex items-center gap-1 sm:gap-1.5">
          <ThemeToggle labels={{ dark: d.a11y.darkMode, light: d.a11y.lightMode }} />
          <div className="hidden sm:block md:hidden">
            <LanguageSwitcher options={languages} label={d.a11y.languageSwitcher} />
          </div>
          <CartLink href={href("/sepetim")} label={d.nav.cart} />
        </div>
      </div>

      {/* category bar (desktop) */}
      <div className="relative hidden border-t border-line lg:block">
        <nav aria-label={d.a11y.mainNav} className="container-site flex min-h-12 items-center gap-1 overflow-x-clip">
          <MegaMenu label={d.nav.products} categories={mega} viewAllLabel={all ? `${all.name} (${all.productCount})` : d.nav.allProducts} viewAllHref={all ? catHref(all.slug) : href("/")} />
          <span aria-hidden="true" className="mx-2 hidden h-5 w-px bg-line xl:block" />
          {real.map((c) => (
            <Link key={c.key} href={catHref(c.slug)} className="hidden min-h-12 items-center rounded-[var(--radius-md)] px-3 xl:inline-flex text-[0.9375rem] font-medium whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink">
              {c.name}
            </Link>
          ))}
          <span className="ms-auto flex items-center gap-1">
            {navLinks.map((l) => (
              <Link key={l.href + l.label} href={l.href} hrefLang={"hrefLang" in l ? l.hrefLang : undefined} className="inline-flex min-h-12 items-center rounded-[var(--radius-md)] px-3 text-[0.9375rem] font-medium whitespace-nowrap text-ink-2 hover:bg-surface-2 hover:text-ink">
                {l.label}
              </Link>
            ))}
          </span>
        </nav>
      </div>
    </header>
  );
}
