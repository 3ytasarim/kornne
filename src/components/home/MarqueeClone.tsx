"use client";

import { useEffect, useRef } from "react";

/**
 * Second (looping) copy of the marquee list, cloned in the browser from the server-rendered first copy — keeps the
 * duplicate out of the HTML/RSC payload. React renders no children here, so it never reconciles the cloned nodes.
 * The track starts moving only once the clone exists (`data-ready`), so there is no jump at the loop point.
 */
export function MarqueeClone() {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = ref.current;
    const src = ul?.previousElementSibling;
    if (!ul || !src || ul.childElementCount) return;
    for (const li of Array.from(src.children)) {
      const c = li.cloneNode(true) as HTMLElement;
      c.querySelectorAll("a").forEach((a) => a.setAttribute("tabindex", "-1"));
      ul.appendChild(c);
    }
    ul.parentElement?.setAttribute("data-ready", "true");
  }, []);
  return <ul ref={ref} aria-hidden="true" className="flex gap-3 pe-3" />;
}
