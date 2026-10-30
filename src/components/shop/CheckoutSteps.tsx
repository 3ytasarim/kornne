import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/** Three-step progress (Sepet → Firma bilgileri → EFT/Havale). Purely informative: an ordered list with aria-current. */
export function CheckoutSteps({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <ol aria-label={label} className="flex items-center gap-2 text-sm sm:gap-3">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", i < current ? "bg-success text-white" : i === current ? "bg-brand-700 text-white" : "border border-line-strong text-steel")}>
            {i < current ? <Check aria-hidden="true" className="size-4" /> : i + 1}
          </span>
          <span className={cn("truncate", i === current ? "font-semibold text-ink" : "text-steel max-sm:hidden")}>{s}</span>
          {i < steps.length - 1 ? <span aria-hidden="true" className="h-px w-6 bg-line-strong sm:w-10" /> : null}
        </li>
      ))}
    </ol>
  );
}
