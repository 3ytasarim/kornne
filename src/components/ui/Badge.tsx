import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "brand" | "signal" | "success" | "warning" | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  brand: "bg-brand-100 text-brand-800 dark:text-brand-300",
  signal: "bg-signal text-white",
  success: "bg-success-50 text-success",
  warning: "bg-warning-50 text-warning",
  outline: "border border-line-strong text-steel",
};

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide", tones[tone], className)}>{children}</span>;
}
