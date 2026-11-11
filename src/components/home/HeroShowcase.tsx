"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { format } from "@/lib/i18n/format";
import { cn } from "@/lib/cn";

export type HeroSlide = { src: string; alt: string; href: string; hrefLang?: string; price: string | null };
type Labels = { pause: string; play: string; prev: string; next: string; slide: string; view: string; onSite: string; vatIncluded: string };

const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Hero photo stage. Client request (23.10.2026): the photos must be shown COMPLETELY → `object-contain` (never cropped,
 * no zoom), the free space is filled with a blurred copy of the same photo, and every control/caption sits in a bar
 * BELOW the photo instead of on top of it. Story-style progress bars drive the timing (CSS animation → `animationend`
 * advances), so pausing = `animation-play-state`. WCAG 2.2.2: explicit pause/play, pauses on hover/focus;
 * prefers-reduced-motion → no autoplay (manual arrows only). Only the first photo is in the server HTML (priority);
 * previous/current/next are mounted after hydration.
 */
export function HeroShowcase({ slides, labels, duration = 6 }: { slides: HeroSlide[]; labels: Labels; duration?: number }) {
  const hydrated = useHydrated();
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [moved, setMoved] = useState(false);
  // keep previous (fading out), current and next (preloading) mounted; images stay in the HTTP cache afterwards
  const near = (i: number) => [index, (index + 1) % slides.length, ...(moved ? [(index - 1 + slides.length) % slides.length] : [])].includes(i);
  const go = (n: number) => {
    setMoved(true);
    setIndex((n + slides.length) % slides.length);
  };
  const current = slides[index]!;
  const paused = userPaused || hover;

  return (
    <div
      className={cn("flex h-full flex-col overflow-hidden rounded-[28px] bg-brand-900 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] ring-1 ring-white/10", paused && "kn-paused")}
      style={{ ["--kn-slide" as string]: `${duration}s` }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setHover(true)}
      onBlurCapture={() => setHover(false)}
      aria-roledescription="carousel"
      aria-label={labels.onSite}
    >
      {/* photo: always the whole picture */}
      <div className="relative isolate aspect-square w-full overflow-hidden sm:aspect-[4/3] lg:aspect-auto lg:min-h-0 lg:flex-1">
        {slides.map((s, i) =>
          i === 0 || (hydrated && near(i)) ? (
            <div key={s.src} aria-hidden={i !== index} className={cn("absolute inset-0 transition-opacity duration-[1100ms] ease-[var(--ease-premium)]", i === index ? "opacity-100" : "opacity-0")}>
              {/* backdrop: same file and size as the photo (one request), blurred and dimmed to fill the free space */}
              <Image src={s.src} alt="" fill quality={60} sizes="(min-width:1024px) 52vw, 100vw" className="scale-110 object-cover opacity-50 blur-2xl" />
              <Image src={s.src} alt={i === index ? s.alt : ""} fill priority={i === 0} fetchPriority={i === 0 ? "high" : "low"} quality={60} sizes="(min-width:1024px) 52vw, 100vw" className="object-contain" />
            </div>
          ) : null,
        )}
      </div>

      {/* bar below the photo: progress, caption, controls */}
      <div className="border-t border-white/10 bg-brand-950/80 px-4 pt-3 pb-4 sm:px-5">
        <div className="flex gap-1.5">
          {slides.map((s, i) => (
            <button key={s.src} type="button" onClick={() => go(i)} aria-label={format(labels.slide, { n: i + 1, total: slides.length })} aria-current={i === index ? "true" : undefined} className="relative h-5 flex-1 cursor-pointer">
              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
                <span
                  key={i === index ? `a-${index}` : `i-${i}`}
                  data-state={i === index ? "active" : i < index ? "done" : "idle"}
                  onAnimationEnd={i === index ? () => go(index + 1) : undefined}
                  className="kn-progress absolute inset-0 rounded-full bg-white"
                />
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href={current.href} hrefLang={current.hrefLang} className="group/cap flex w-full min-w-0 items-center justify-between gap-3 text-white sm:flex-1">
            <span className="min-w-0">
              <span className="block text-[0.6875rem] font-semibold tracking-[0.14em] text-white/60 uppercase">{labels.onSite}</span>
              <span key={current.src} className="kn-rise block truncate text-base font-semibold sm:text-lg">
                {current.alt}
              </span>
              {current.price ? (
                <span className="block text-sm text-white/80">
                  <span className="font-bold text-white tabular-nums" dir="ltr">
                    {current.price}
                  </span>
                  {labels.vatIncluded ? ` · ${labels.vatIncluded}` : null}
                </span>
              ) : null}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-brand-900 transition-transform group-hover/cap:translate-x-0.5 rtl:group-hover/cap:-translate-x-0.5">
              {labels.view}
              <ArrowRight aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            </span>
          </Link>
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={() => go(index - 1)} aria-label={labels.prev} className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">
              <ChevronLeft aria-hidden="true" className="size-5 rtl:-scale-x-100" />
            </button>
            <button type="button" onClick={() => setUserPaused((p) => !p)} aria-label={userPaused ? labels.play : labels.pause} aria-pressed={userPaused} className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">
              {userPaused ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label={labels.next} className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10">
              <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
