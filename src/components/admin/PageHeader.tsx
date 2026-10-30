import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-h2 font-bold text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-steel">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = "neutral" }: { label: string; value: ReactNode; hint?: string; tone?: "neutral" | "warning" | "success" }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
      <p className="text-xs font-semibold tracking-wide text-steel uppercase">{label}</p>
      <p className={`mt-2 font-display text-3xl font-bold tabular-nums ${tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-ink"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-steel">{hint}</p> : null}
    </div>
  );
}
