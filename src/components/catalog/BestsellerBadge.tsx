import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Modern "En çok satan" pill (replaces the legacy round sticker image). Warm gradient in orange-700 → amber-700 so the
 * white label keeps ≥ 4.5:1 contrast; a slow light sweep (CSS, off with prefers-reduced-motion).
 */
export function BestsellerBadge({ label, className, size = "sm" }: { label: string; className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("kn-shine relative inline-flex items-center gap-1 overflow-hidden rounded-full bg-gradient-to-r from-[#c2410c] to-[#b45309] font-semibold text-white shadow-[0_6px_16px_-6px_rgb(194_65_12/0.6)] ring-1 ring-white/20", size === "md" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-[0.6875rem]", className)}>
      <Flame aria-hidden="true" className={size === "md" ? "size-3.5" : "size-3"} />
      {label}
    </span>
  );
}
