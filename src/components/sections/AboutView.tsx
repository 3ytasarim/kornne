import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Cpu, HeartPulse, LifeBuoy, PencilRuler, RefreshCw } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { GALLERY_PHOTOS } from "@/config/showcase";
import type { CatalogCategory } from "@/lib/catalog/types";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";

const ICONS = [PencilRuler, Cpu, HeartPulse, BadgeCheck, RefreshCw, LifeBuoy];
// real on-site photos already used on the home page (src/config/showcase.ts)
const PHOTOS = ["/upload/7.png", "/upload/Mezbaha Teknolojileri1.png", "/upload/6.png"];

/**
 * The CMS body is sanitized HTML from Admin › İçerik. Its first paragraph becomes the hero lead; short paragraphs without
 * a full stop are the source page's section titles, so they render as headings.
 */
function splitBody(html: string) {
  const first = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const lead = first ? first[1]!.replace(/<[^>]+>/g, "").trim() : "";
  const rest = (first ? html.replace(first[0], "") : html).replace(/<p>([^<.]{3,70})<\/p>/g, "<h2>$1</h2>");
  return { lead, rest };
}

export function AboutView({
  locale,
  d,
  href,
  t,
  title,
  bodyHtml,
  categories,
  breadcrumbs,
}: {
  locale: Locale;
  d: Dictionary;
  href: (p: string) => string;
  t: (s: string, v: Record<string, string | number>) => string;
  title: string;
  bodyHtml: string;
  categories: CatalogCategory[];
  breadcrumbs: React.ReactNode;
}) {
  const { lead, rest } = splitBody(bodyHtml);
  const a = d.about;
  const real = categories.filter((c) => !c.isAllProducts);
  const all = categories.find((c) => c.isAllProducts);
  const photoAlt = (src: string) => {
    const ph = GALLERY_PHOTOS.find((p) => p.src === src);
    if (!ph) return "";
    if (locale === "tr") return ph.alt;
    return real.find((c) => c.key === ph.categoryKey)?.name ?? "";
  };

  return (
    <div className="container-site py-8 md:py-12">
      {breadcrumbs}

      {/* hero */}
      <section aria-labelledby="about-title" className="relative mt-6 overflow-hidden rounded-[2rem] bg-brand-950 text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:p-14">
          <div className="min-w-0 space-y-6">
            <p className="kn-rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85" style={{ ["--i" as string]: 0 }}>
              <span aria-hidden="true" className="inline-flex size-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgb(52_211_153/0.2)]" />
              {d.corporate.lead}
            </p>
            <h1 id="about-title" className="kn-rise font-display text-display font-bold break-words hyphens-auto text-white max-[400px]:text-[1.875rem]" style={{ ["--i" as string]: 1 }}>
              {title}
            </h1>
            {lead ? (
              <p className="kn-rise max-w-xl text-lg leading-relaxed text-white/75" style={{ ["--i" as string]: 2 }}>
                {lead}
              </p>
            ) : null}
            <div className="kn-rise flex flex-wrap gap-3" style={{ ["--i" as string]: 3 }}>
              <ButtonLink href={href("/iletisim")} variant="light" size="lg">
                {a.ctaPrimary}
              </ButtonLink>
              {all ? (
                <ButtonLink href={href(`/kategori/${all.slug}`)} variant="outline" size="lg" className="border-white/30 text-white hover:border-white hover:text-white" iconEnd={<ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />}>
                  {a.ctaSecondary}
                </ButtonLink>
              ) : null}
            </div>
          </div>

          {/* photo collage: one tall photo + two stacked */}
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:gap-4">
            {PHOTOS.map((src, i) => (
              <div key={src} className={`relative overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 ${i === 0 ? "row-span-2" : "aspect-[4/3]"}`}>
                <Image src={src} alt={photoAlt(src)} fill priority={i === 0} quality={65} sizes="(min-width:1024px) 25vw, 50vw" className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* story + product range */}
      <section aria-labelledby="about-story" className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-14">
        <div className="min-w-0">
          <h2 id="about-story" className="font-display text-h2 font-bold text-ink">
            {a.storyTitle}
          </h2>
          <div className="rich about-rich mt-6" dangerouslySetInnerHTML={{ __html: rest }} />
        </div>
        <aside aria-labelledby="about-range" className="min-w-0 lg:sticky lg:top-44 lg:self-start">
          <div className="rounded-[1.5rem] border border-line bg-surface-2 p-6">
            <h2 id="about-range" className="text-xs font-semibold tracking-[0.14em] text-steel uppercase">
              {a.rangeTitle}
            </h2>
            <ul className="mt-4 divide-y divide-line">
              {real.map((c) => (
                <li key={c.key}>
                  <Link href={href(`/kategori/${c.slug}`)} className="group flex min-h-14 items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink group-hover:text-brand-700">{c.name}</span>
                      <span className="block text-sm text-steel">{t(a.products, { count: c.productCount })}</span>
                    </span>
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-steel transition-transform group-hover:translate-x-0.5 group-hover:text-brand-700 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {/* principles */}
      <section aria-labelledby="about-values" className="mt-20">
        <div className="max-w-2xl space-y-2">
          <h2 id="about-values" className="font-display text-h2 font-bold text-ink">
            {a.valuesTitle}
          </h2>
          <p className="text-steel">{a.valuesLead}</p>
        </div>
        <ul className="kn-reveal mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {a.values.map((v, i) => {
            const Icon = ICONS[i % ICONS.length]!;
            return (
              <li key={v.title} className="group rounded-[1.5rem] border border-line bg-surface p-6 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-[0_16px_40px_-24px_rgb(15_23_42/0.35)] motion-reduce:hover:translate-y-0">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-white/5 dark:text-brand-300 dark:ring-white/10">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-ink">{v.title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-2">{v.text}</p>
              </li>
            );
          })}
        </ul>
      </section>
      {/* the closing call to action is the footer's contact card */}
    </div>
  );
}
