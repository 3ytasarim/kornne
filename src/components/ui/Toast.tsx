"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Toasts announced through a polite live region (pattern extracted from BiciriklarKids CommerceProvider notify()).
 * Errors use role="alert". Auto-dismiss after 5s; never the only channel for critical information.
 */
type Tone = "info" | "success" | "error";
type ToastItem = { id: number; tone: Tone; message: string };
const Ctx = createContext<{ notify: (message: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (message: string, tone: Tone = "info") => {
      const id = Date.now() + Math.random();
      setItems((all) => [...all.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ notify }), [notify]);
  const Icon = { info: Info, success: CheckCircle2, error: TriangleAlert };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pe-6">
        {items.map((t) => {
          const I = Icon[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-md)] border bg-surface p-4 text-sm shadow-[var(--shadow-pop)]", t.tone === "error" ? "border-signal/40" : t.tone === "success" ? "border-success/40" : "border-line")}>
              <I aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", t.tone === "error" ? "text-signal" : t.tone === "success" ? "text-success" : "text-brand-600")} />
              <p className="flex-1 text-ink">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} aria-label={closeLabel} className="-m-2 inline-flex size-10 items-center justify-center rounded-full text-steel hover:bg-surface-2">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
