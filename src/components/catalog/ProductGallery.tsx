"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import type { CatalogImage } from "@/lib/catalog/types";

/**
 * Product gallery: main image + thumbnails + fullscreen lightbox with pointer-follow zoom.
 * Combines Mezbaha-Teknolojileri product-gallery.tsx (carousel semantics, arrow keys, 2.5× cursor zoom, RTL arrows)
 * with Bifire Lightbox.tsx (native <dialog> → real focus trap, Esc, inert background). Swipe on touch.
 * Real <img> (next/image) with alt + width/height for Google Images; first image is the LCP (priority).
 */
type Labels = { gallery: string; prev: string; next: string; zoom: string; close: string; imageOf: string; noImage: string };

export function ProductGallery({ images, title, labels }: { images: CatalogImage[]; title: string; labels: Labels }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const touchX = useRef<number | null>(null);
  const count = images.length;
  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);
  const rtl = () => typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const current = images[index];

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const forward = e.key === "ArrowRight" ? !rtl() : rtl();
    go(forward ? 1 : -1);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") touchX.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (touchX.current === null) return;
    const dx = e.clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go((dx < 0) !== rtl() ? 1 : -1);
  };
  const counter = labels.imageOf.replace("{n}", String(index + 1)).replace("{total}", String(count));

  if (!current) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-[var(--radius-lg)] bg-surface-2 text-steel">{labels.noImage}</div>;
  }

  const arrows = (dark = false) =>
    count > 1 ? (
      <>
        <button type="button" onClick={() => go(-1)} aria-label={labels.prev} className={cn("absolute start-3 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full shadow-md backdrop-blur", dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-surface/90 text-ink hover:bg-surface")}>
          <ChevronLeft aria-hidden="true" className="size-5 rtl:-scale-x-100" />
        </button>
        <button type="button" onClick={() => go(1)} aria-label={labels.next} className={cn("absolute end-3 top-1/2 z-10 inline-flex size-12 -translate-y-1/2 items-center justify-center rounded-full shadow-md backdrop-blur", dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-surface/90 text-ink hover:bg-surface")}>
          <ChevronRight aria-hidden="true" className="size-5 rtl:-scale-x-100" />
        </button>
      </>
    ) : null;

  return (
    <div className="space-y-3">
      <div role="group" aria-roledescription="carousel" aria-label={labels.gallery} tabIndex={0} onKeyDown={onKey} onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="relative overflow-hidden rounded-[var(--radius-lg)] border border-line bg-gradient-to-b from-surface-2 to-surface-3 focus-visible:outline-3 focus-visible:outline-focus">
        <button type="button" onClick={() => setOpen(true)} className="group relative block aspect-[4/3] w-full cursor-zoom-in" aria-label={`${labels.zoom}: ${current.alt}`}>
          <Image key={current.src} src={current.src} alt={current.alt} fill priority={index === 0} sizes="(min-width:1024px) 640px, 100vw" className="object-contain p-4" />
          <span aria-hidden="true" className="absolute end-3 bottom-3 inline-flex size-10 items-center justify-center rounded-full bg-surface/90 text-ink opacity-0 shadow transition-opacity group-hover:opacity-100">
            <ZoomIn className="size-4" />
          </span>
        </button>
        {arrows()}
        {count > 1 ? (
          <p aria-live="polite" className="absolute start-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
            {counter}
          </p>
        ) : null}
      </div>

      {count > 1 ? (
        <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {images.map((img, i) => (
            <li key={img.src}>
              <button type="button" onClick={() => setIndex(i)} aria-current={i === index ? "true" : undefined} aria-label={`${labels.gallery} ${i + 1}`} className={cn("relative block aspect-square w-full overflow-hidden rounded-[var(--radius-sm)] border-2 bg-surface-2", i === index ? "border-brand-700" : "border-transparent hover:border-line-strong")}>
                <Image src={img.src} alt="" fill sizes="96px" className="object-contain p-1" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setZoom(false);
        }}
        title={`${title} — ${counter}`}
        closeLabel={labels.close}
        variant="fullscreen"
      >
        <div className="relative flex h-full min-h-[70dvh] items-center justify-center" onKeyDown={onKey} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <button
            type="button"
            aria-label={zoom ? `${labels.zoom} (−)` : labels.zoom}
            aria-pressed={zoom}
            onClick={() => setZoom((z) => !z)}
            onPointerMove={(e) => {
              if (!zoom) return;
              const r = e.currentTarget.getBoundingClientRect();
              setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
            }}
            className={cn("relative h-[min(80dvh,60rem)] w-[min(92vw,80rem)] overflow-hidden", zoom ? "cursor-zoom-out" : "cursor-zoom-in")}
          >
            <Image src={current.src} alt={current.alt} fill sizes="92vw" className="object-contain transition-transform duration-200" style={{ transform: zoom ? "scale(2.5)" : "none", transformOrigin: origin }} />
          </button>
          {arrows(true)}
          <span aria-hidden="true" className="absolute end-4 bottom-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs text-white">
            {zoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />} {counter}
          </span>
        </div>
      </Dialog>
    </div>
  );
}
