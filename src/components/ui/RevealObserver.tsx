"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Reveals `.reveal` elements once when they enter the viewport. Copied from Bifire
 * src/components/site/RevealObserver.tsx (own code); CSS lives in globals.css.
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const items = [...document.querySelectorAll<HTMLElement>(".reveal:not(.is-visible)")];
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pathname]);
  return null;
}
