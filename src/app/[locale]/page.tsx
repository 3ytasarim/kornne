import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, FileText, Landmark, Phone, ReceiptText, ShoppingCart } from "lucide-react";
import { CountUp } from "@/components/home/CountUp";
import { HeroShowcase, type HeroSlide } from "@/components/home/HeroShowcase";
import { ProductMarquee } from "@/components/home/ProductMarquee";
import { GALLERY_PHOTOS, HERO_PHOTOS, type ShowcasePhoto } from "@/config/showcase";
import { isBestseller } from "@/config/badges";
import { ENABLED_LOCALES } from "@/lib/i18n/config";
import { cardLabels } from "@/components/catalog/ProductCard";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ButtonAnchor, ButtonLink } from "@/components/ui/Button";
import { whatsappHref, WhatsAppIcon } from "@/components/layout/WhatsAppCta";
import { PageLanguageLinks } from "@/components/layout/PageLanguageLinks";
import { catalog, CATALOG_DATA_VERIFIED } from "@/lib/catalog";
import { productHref, toCard } from "@/lib/catalog/cards";
import type { CatalogProduct } from "@/lib/catalog/types";
import { DEFAULT_BANKS } from "@/lib/commerce/bank-accounts";
import { staticAlternates } from "@/lib/i18n/alternates";
import { getI18n } from "@/lib/i18n/server";
import { formatMoney } from "@/lib/money";
import { buildMetadata } from "@/lib/seo/metadata";
import { getContact } from "@/lib/cms/store";
import { HomeAnnouncements } from "@/components/layout/Announcements";
import { getSiteUrl } from "@/lib/seo/site";

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const { locale, d } = getI18n((await params).locale);
  return buildMetadata({ title: `${d.meta.siteName} — ${d.meta.tagline}`, description: d.meta.defaultDescription, path: "/", locale, noindex: !CATALOG_DATA_VERIFIED });
}

// Editorial groupings of REAL catalog items (by legacy Turkish slug); missing/hidden items simply drop out.
const FEATURED = ["ayakta-kesim-hucresi", "dos-acma-testeresi", "ceyrekleme-testere", "ayak-ve-boynuz-testeresi", "kurban-yatirma-kabini", "hijyen-geciti", "sterilizator-dolap", "bot-yikama"];
const STEP_ICONS = [ShoppingCart, FileText, Landmark, ReceiptText];

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale, d, href, t } = getI18n((await params).locale);
  const s = d.shop;
  const contact = await getContact();
  const [categories, products] = await Promise.all([catalog.listCategories(locale), catalog.listProducts(locale)]);
  const bySlug = new Map(products.map((p) => [p.slugs.tr ?? p.slug, p]));
  const pick = (slugs: string[]) => slugs.map((x) => bySlug.get(x)).filter((p): p is CatalogProduct => !!p && !!p.images[0]);
  // legacy home section "En Çok Satanlar": the products that carried the bestseller sticker first, editorial picks after
  const bestsellers = products.filter((p) => isBestseller(p) && p.priceVerified && p.images[0]);
  const featured = [...bestsellers, ...pick(FEATURED).filter((p) => !isBestseller(p))].slice(0, 8);
  const all = categories.find((c) => c.isAllProducts);
  const allHref = href(`/kategori/${all?.slug ?? "tum-urunler"}`);
  const real = categories.filter((c) => !c.isAllProducts);
  const labels = cardLabels(d);
  const price = (p: CatalogProduct) => (p.priceVerified && p.priceMinor !== null ? formatMoney(p.priceMinor, p.currency, locale) : null);
  const used = new Set<string>();
  const coverFor = (key: string) => {
    const p = products.find((x) => x.categoryKeys.includes(key) && x.images[0] && !used.has(x.images[0].src));
    if (p?.images[0]) used.add(p.images[0].src);
    return p?.images[0];
  };
  const waMessage = t(d.product.whatsappMessage, { url: getSiteUrl() });
  const langOf = (p: CatalogProduct) => (p.pageLocale !== locale ? p.pageLocale : undefined);
  // installation photos → product (price shown) or category; caption in the page language where the catalog has it
  const photo = (ph: ShowcasePhoto): HeroSlide & { group: string } => {
    const prod = ph.productSlug ? bySlug.get(ph.productSlug) : undefined;
    const cat = real.find((c) => c.key === ph.categoryKey);
    // Turkish pages name the exact machine on the photo; other locales use the translated catalog name
    if (prod) return { src: ph.src, alt: locale === "tr" ? ph.alt : prod.title, group: prod.title, href: productHref(prod), hrefLang: langOf(prod), price: ph.productSlug === "platformlar" ? null : price(prod) };
    return { src: ph.src, alt: locale === "tr" ? ph.alt : (cat?.name ?? ph.alt), group: cat?.name ?? "", href: cat ? href(`/kategori/${cat.slug}`) : allHref, price: null };
  };
  const heroSlides = HERO_PHOTOS.map(photo);
  const gallery = GALLERY_PHOTOS.map(photo);
  const marquee = products
    .filter((p) => p.images[0] && p.priceVerified)
    .slice(0, 10)
    .map((p) => ({ href: productHref(p), hrefLang: langOf(p), title: p.title, image: p.images[0]!.src, price: price(p) }));

  return (
    <>
      <PageLanguageLinks links={staticAlternates("/")} />
      <HomeAnnouncements locale={locale} label={d.cms.announcement} />

      {/* Hero — dark stage with real installation photos (legacy home slider originals), CSS-only motion */}
      {/* static radial glows (no filter blur, no animated layers → cheap paint on low-end phones) */}
      <section className="relative isolate overflow-hidden bg-brand-950 bg-[radial-gradient(40rem_28rem_at_0%_0%,rgb(52_80_122/0.45),transparent_70%),radial-gradient(36rem_26rem_at_100%_100%,rgb(74_106_149/0.3),transparent_70%)] text-white" data-analytics-location="home_hero">
        {/* mobile order: heading → photo stage → lead/CTAs (photos above the fold); desktop: text left, stage right */}
        <div className="container-site grid grid-cols-1 gap-x-14 gap-y-7 pt-8 pb-8 md:pt-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr] lg:gap-y-6 lg:pt-16 lg:pb-12">
          {/* min-w-0 + hyphenation: long Russian words must wrap at 320 px instead of widening the grid */}
          <div className="min-w-0 space-y-5 self-end lg:space-y-6">
            <p className="kn-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85 backdrop-blur" style={{ ["--i" as string]: 0 }}>
              <span aria-hidden="true" className="inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgb(52_211_153/0.2)]" />
              {s.hero.eyebrow}
            </p>
            <h1 className="font-display text-display font-bold break-words hyphens-auto text-white max-[400px]:text-[1.875rem]">
              {d.home.title}
            </h1>
          </div>
          <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
            <p className="kn-rise max-w-xl text-lg leading-relaxed text-white/75" style={{ ["--i" as string]: 2 }}>
              {t(s.hero.lead, { count: products.length })}
            </p>
            <div className="kn-rise flex flex-wrap gap-3" style={{ ["--i" as string]: 3 }}>
              <ButtonLink href={allHref} size="lg" variant="light" iconEnd={<ArrowRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />}>
                {s.hero.ctaShop}
              </ButtonLink>
              <ButtonLink href={href("/iletisim")} size="lg" variant="ghost" className="border border-white/25 text-white hover:bg-white/10">
                {s.hero.ctaQuote}
              </ButtonLink>
            </div>
            <ul className="kn-rise grid max-w-xl gap-x-6 gap-y-2.5 pt-1 text-sm text-white/80 sm:grid-cols-2" style={{ ["--i" as string]: 4 }}>
              {s.trust.map((x) => (
                <li key={x.title} className="flex items-center gap-2">
                  <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-emerald-400" />
                  {x.title}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative row-start-2 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:h-[36rem] lg:self-center">
            <HeroShowcase slides={heroSlides} labels={{ ...s.motion, vatIncluded: s.buy.vatIncluded }} />
          </div>
        </div>

        {/* animated facts — counted from the database */}
        <div className="border-t border-white/10">
          <dl className="container-site grid grid-cols-2 gap-y-6 py-7 lg:grid-cols-4">
            {[
              { v: products.length, l: s.motion.statProducts },
              { v: real.length, l: s.motion.statCategories },
              { v: ENABLED_LOCALES.length, l: s.motion.statLanguages },
              { v: DEFAULT_BANKS.length, l: s.motion.statBanks },
            ].map((f) => (
              <div key={f.l} className="flex flex-col-reverse gap-1 border-white/10 px-1 lg:border-s lg:px-6 lg:first:border-s-0 lg:first:ps-0">
                <dt className="text-sm text-white/65">{f.l}</dt>
                <dd className="text-4xl font-bold tracking-tight text-white tabular-nums">
                  <CountUp value={f.v} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <ProductMarquee items={marquee} label={s.motion.marquee} />

      {/* Categories */}
      <section aria-labelledby="home-categories" className="container-site py-16 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <h2 id="home-categories" className="font-display text-h2 font-bold text-ink">
              {s.home.categoriesTitle}
            </h2>
            <p className="text-steel">{s.home.categoriesLead}</p>
          </div>
          <ButtonLink href={allHref} variant="outline" iconEnd={<ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />}>
            {s.home.allProducts}
          </ButtonLink>
        </div>
        <ul className="kn-reveal grid grid-cols-1 gap-4 md:grid-cols-3">
          {real.map((c) => {
            const img = coverFor(c.key);
            return (
              <li key={c.key} className="min-w-0">
                <Link href={href(`/kategori/${c.slug}`)} className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-line bg-surface transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--shadow-card)]">
                  <span className="relative block aspect-[16/10] bg-surface-2">
                    {img ? <Image src={img.src} alt="" fill quality={65} sizes="(min-width:768px) 33vw, 100vw" className="object-contain p-6 mix-blend-multiply transition-transform duration-500 ease-[var(--ease-premium)] group-hover:scale-[1.04] dark:mix-blend-normal" /> : null}
                  </span>
                  <span className="flex items-center justify-between gap-3 p-5">
                    <span className="min-w-0">
                      <span className="block text-lg font-bold break-words hyphens-auto text-ink">{c.name}</span>
                      <span className="text-sm text-steel">{t(d.home.productCount, { count: c.productCount })}</span>
                    </span>
                    <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line text-ink transition-colors group-hover:border-brand-700 group-hover:bg-brand-700 group-hover:text-white">
                      <ArrowRight className="size-4 rtl:-scale-x-100" />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Featured priced products */}
      {featured.length ? (
        <section aria-labelledby="home-featured" className="bg-surface-2 py-16 md:py-20">
          <div className="container-site">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl space-y-2">
                <h2 id="home-featured" className="font-display text-h2 font-bold text-ink">
                  {bestsellers.length ? s.home.bestsellersTitle : s.home.featuredTitle}
                </h2>
                <p className="text-steel">{bestsellers.length ? s.home.bestsellersLead : s.home.featuredLead}</p>
              </div>
              <ButtonLink href={allHref} variant="outline" className="bg-surface" iconEnd={<ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />}>
                {s.home.allProducts}
              </ButtonLink>
            </div>
            <ProductGrid cards={featured.map((p) => toCard(p, locale))} labels={labels} headingLevel={3} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" />
          </div>
        </section>
      ) : null}

      {/* Installations — bento gallery of real site photos (scroll-revealed where the browser supports view timelines) */}
      <section aria-labelledby="home-gallery" className="bg-brand-950 py-16 text-white md:py-20">
        <div className="container-site">
          <div className="kn-reveal mb-8 max-w-2xl space-y-2">
            <h2 id="home-gallery" className="font-display text-h2 font-bold text-white">
              {s.motion.galleryTitle}
            </h2>
            <p className="text-white/70">{s.motion.galleryLead}</p>
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-4 lg:grid-cols-5">
            {gallery.map((g) => (
              <li key={g.src} className="kn-reveal min-w-0">
                <Link href={g.href} hrefLang={g.hrefLang} className="group block">
                  {/* square tile = the photo's own ratio → the whole picture is visible, nothing cropped */}
                  <span className="relative block aspect-square overflow-hidden rounded-2xl ring-1 ring-white/10">
                    <Image src={g.src} alt={g.alt} fill quality={62} sizes="(min-width:1024px) 20vw, (min-width:768px) 33vw, 50vw" className="object-cover transition-transform duration-700 ease-[var(--ease-premium)] group-hover:scale-[1.03]" />
                  </span>
                  <span className="mt-3 flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[0.625rem] font-semibold tracking-[0.14em] text-white/55 uppercase">{g.group && g.group !== g.alt ? g.group : s.motion.onSite}</span>
                      <span className="block text-sm font-semibold text-white group-hover:underline">{g.alt}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-white/60 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How to order — B2B bank transfer flow + the banks the client works with */}
      <section aria-labelledby="home-order" className="container-site py-16 md:py-20">
        <div className="mb-10 max-w-2xl space-y-2">
          <h2 id="home-order" className="font-display text-h2 font-bold text-ink">
            {s.home.howTitle}
          </h2>
          <p className="text-steel">{s.home.howLead}</p>
        </div>
        <ol className="kn-reveal grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {s.home.howSteps.map((step, i) => {
            const Icon = STEP_ICONS[i] ?? ShoppingCart;
            return (
              <li key={step.title} className="relative rounded-[var(--radius-lg)] border border-line bg-surface p-6">
                <span className="mb-5 flex items-center justify-between">
                  <span aria-hidden="true" className="inline-flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-brand-700 text-white">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-mono text-sm font-semibold text-steel tabular-nums">0{i + 1}</span>
                </span>
                <h3 className="text-h3 font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-steel">{step.text}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-6 flex flex-col gap-5 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex min-w-0 items-center gap-4">
            <Landmark aria-hidden="true" className="size-8 shrink-0 text-brand-700 dark:text-brand-300" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">{s.banks.title}</p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-steel">
                {DEFAULT_BANKS.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={href("/banka-hesaplari")} variant="secondary" className="bg-surface">
              {s.banks.all}
            </ButtonLink>
            <ButtonLink href={href("/odeme-bildirimi")} variant="outline">
              {d.nav.paymentNotice}
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Project / bulk quote */}
      <section className="container-site pb-4">
        <div className="relative overflow-hidden rounded-[var(--radius-xl)] bg-brand-950 bg-[radial-gradient(28rem_18rem_at_100%_0%,rgb(52_80_122/0.55),transparent_70%)] p-8 text-white md:p-12">
                    <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <h2 className="font-display text-h2 font-bold text-white">{s.home.ctaTitle}</h2>
              <p className="text-white/75">{s.home.ctaText}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonAnchor href={whatsappHref(waMessage, contact.whatsapp)} variant="whatsapp" size="lg" icon={<WhatsAppIcon className="size-5" />}>
                {d.contact.whatsapp}
              </ButtonAnchor>
              <ButtonAnchor href={`tel:${contact.phoneE164}`} variant="light" size="lg" icon={<Phone aria-hidden="true" className="size-4" />}>
                <span dir="ltr">{contact.phoneDisplay}</span>
              </ButtonAnchor>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
