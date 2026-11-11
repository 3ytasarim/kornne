import Image from "next/image";
import Link from "next/link";
import { MarqueeClone } from "./MarqueeClone";

export type MarqueeItem = { href: string; hrefLang?: string; title: string; image: string; price: string | null };

/**
 * Infinite product strip (pure CSS: the list exists twice and is translated by -50%). The duplicate is cloned client-side
 * (MarqueeClone), hidden from assistive tech and removed from the tab order; hover/focus pauses; reduced motion → a plain horizontal scroller.
 */
export function ProductMarquee({ items, label }: { items: MarqueeItem[]; label: string }) {
  const row = () =>
    items.map((p) => (
      <li key={p.href} className="shrink-0">
        <Link href={p.href} hrefLang={p.hrefLang} className="group flex w-[17rem] items-center gap-3 rounded-2xl border border-line bg-surface p-2 pe-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--shadow-card)]">
          <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
            <Image src={p.image} alt="" fill sizes="64px" quality={60} className="object-contain p-1.5 mix-blend-multiply transition-transform duration-500 group-hover:scale-110 dark:mix-blend-normal" />
          </span>
          <span className="min-w-0">
            <span className="line-clamp-2 text-sm leading-snug font-semibold [overflow-wrap:anywhere] hyphens-auto text-ink">{p.title}</span>
            {p.price ? (
              <span className="mt-0.5 block text-sm font-bold text-brand-700 tabular-nums dark:text-brand-300" dir="ltr">
                {p.price}
              </span>
            ) : null}
          </span>
        </Link>
      </li>
    ));
  return (
    <section aria-label={label} className="kn-marquee relative overflow-hidden border-b border-line bg-surface-2 py-5">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-0 z-10 w-16 bg-gradient-to-r from-surface-2 to-transparent rtl:bg-gradient-to-l" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-0 z-10 w-16 bg-gradient-to-l from-surface-2 to-transparent rtl:bg-gradient-to-r" />
      <div className="kn-marquee-track flex w-max" style={{ ["--kn-marquee" as string]: `${Math.max(40, items.length * 5)}s` }}>
        <ul className="flex gap-3 pe-3">{row()}</ul>
        <MarqueeClone />
      </div>
    </section>
  );
}
