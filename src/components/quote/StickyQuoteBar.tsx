"use client";

import { useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";

/**
 * Mobile-only sticky CTA. Appears only after the main quote panel (#quote-cta) has scrolled past the top, reserves
 * its own height at the page bottom (no content is covered) and hides the floating WhatsApp button while shown.
 * Clicking scrolls back to the real panel — variant/quantity choice lives in one place.
 */
export function StickyQuoteBar({ title, cta }: { title: string; cta: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const target = document.getElementById("quote-cta");
    if (!target) return;
    // Scroll check (rAF-throttled) instead of IntersectionObserver: a jump straight past the panel (anchor link,
    // fast fling) never "intersects", so an observer would miss it.
    let frame = 0;
    const check = () => {
      frame = 0;
      setShow(target.getBoundingClientRect().bottom < 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-sticky-cta", show);
    return () => document.documentElement.removeAttribute("data-sticky-cta");
  }, [show]);
  return (
    <>
      <div aria-hidden="true" className={show ? "h-20 lg:hidden" : "hidden"} />
      <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgb(21_26_32/0.25)] backdrop-blur transition-transform duration-200 lg:hidden ${show ? "translate-y-0" : "pointer-events-none translate-y-full"}`} aria-hidden={!show}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <p className="line-clamp-2 flex-1 text-sm font-semibold text-ink">{title}</p>
          <button
            type="button"
            tabIndex={show ? 0 : -1}
            onClick={() => document.getElementById("quote-cta")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-[var(--radius-md)] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <MessageSquareQuote aria-hidden="true" className="size-4" />
            {cta}
          </button>
        </div>
      </div>
    </>
  );
}
