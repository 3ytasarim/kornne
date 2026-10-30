"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { clampQty, QUOTE_MAX_QTY } from "@/lib/quote/store";

/** Accessible quantity input (1–999): −/+ buttons with 48px targets + a numeric field that clamps invalid input. */
export function QuantityStepper({ value, onChange, labels, size = "md" }: { value: number; onChange: (n: number) => void; labels: { quantity: string; decrease: string; increase: string }; size?: "sm" | "md" }) {
  const id = useId();
  const h = size === "sm" ? "h-10" : "h-12";
  return (
    <div className={`inline-flex ${h} items-stretch overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-surface`}>
      <button type="button" aria-label={labels.decrease} disabled={value <= 1} onClick={() => onChange(clampQty(value - 1))} className={`inline-flex ${size === "sm" ? "w-10" : "w-12"} items-center justify-center text-ink hover:bg-surface-2 disabled:opacity-40`}>
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <label htmlFor={id} className="sr-only">
        {labels.quantity}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={QUOTE_MAX_QTY}
        step={1}
        value={value}
        onChange={(e) => onChange(clampQty(Number(e.target.value)))}
        className="w-14 border-x border-line bg-transparent text-center text-[0.9375rem] font-semibold text-ink tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" aria-label={labels.increase} disabled={value >= QUOTE_MAX_QTY} onClick={() => onChange(clampQty(value + 1))} className={`inline-flex ${size === "sm" ? "w-10" : "w-12"} items-center justify-center text-ink hover:bg-surface-2 disabled:opacity-40`}>
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
