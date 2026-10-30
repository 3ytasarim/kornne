import type { ReactNode } from "react";
import { PackageOpen, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({ title, text, action, icon, className }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface-2 px-6 py-14 text-center", className)}>
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-surface text-steel">{icon ?? <PackageOpen aria-hidden="true" className="size-7" />}</span>
      <p className="text-h3 font-bold text-ink">{title}</p>
      {text ? <p className="max-w-md text-steel">{text}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-signal/30 bg-signal-50 px-6 py-14 text-center">
      <TriangleAlert aria-hidden="true" className="size-8 text-signal" />
      <p className="text-h3 font-bold text-ink">{title}</p>
      {text ? <p className="max-w-md text-ink-2">{text}</p> : null}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/** Card-grid skeleton for listing loading states (admin routes; public routes stream without loading.tsx). */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-[var(--radius-lg)] border border-line p-3">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning"; children: ReactNode; className?: string }) {
  return (
    <div role="note" className={cn("rounded-[var(--radius-md)] border px-4 py-3 text-sm", tone === "warning" ? "border-warning/30 bg-warning-50 text-warning" : "border-brand-300/50 bg-brand-50 text-brand-800 dark:text-brand-300", className)}>
      {children}
    </div>
  );
}
