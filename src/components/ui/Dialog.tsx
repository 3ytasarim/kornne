"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal dialog and side drawer on the native <dialog> element (showModal): the browser provides the focus trap,
 * Esc to close, background inertness and top-layer stacking. Pattern from Bifire Lightbox/ConfirmAction.
 * Drawer sides are LOGICAL (start/end) so they mirror automatically in RTL.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** visually hide the title (still the accessible name) */
  hideTitle?: boolean;
  closeLabel: string;
  variant?: "modal" | "drawer-start" | "drawer-end" | "fullscreen";
  className?: string;
  children: ReactNode;
};

export function Dialog({ open, onClose, title, hideTitle, closeLabel, variant = "modal", className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const shape =
    variant === "modal"
      ? "m-auto w-[min(100%-2rem,40rem)] max-h-[min(90dvh,48rem)] rounded-[var(--radius-lg)]"
      : variant === "fullscreen"
        ? "m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 text-white"
        : cn("my-0 h-dvh max-h-none w-[min(88vw,24rem)] max-w-none", variant === "drawer-start" ? "ms-0 me-auto" : "ms-auto me-0");

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onClose();
      }}
      onClick={(e) => {
        // click on the backdrop (the dialog element itself, outside the panel) closes
        if (e.target === ref.current) onClose();
      }}
      className={cn("overflow-hidden bg-surface p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-black/60", shape, className)}
    >
      <div className="flex h-full max-h-[inherit] flex-col">
        <div className={cn("flex items-center justify-between gap-4 px-5 py-4", variant === "fullscreen" ? "" : "border-b border-line")}>
          <h2 id={titleId} className={cn("text-h3 font-bold", hideTitle && "sr-only")}>
            {title}
          </h2>
          <button type="button" onClick={onClose} className="ms-auto inline-flex size-12 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10" aria-label={closeLabel}>
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </dialog>
  );
}
