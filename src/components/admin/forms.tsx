"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { buttonClass, type ButtonVariant } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import type { ActionState } from "@/lib/admin/action-state";
import { cn } from "@/lib/cn";

/**
 * Admin form kit. Every form posts to a server action (which re-checks the session and permission itself);
 * the state carries per-field errors (aria-invalid + role=alert) and a status line (aria-live).
 */
type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;
const noop = () => () => {};
/** false during SSR / hydration, true once the client has taken over (no effect + setState needed). */
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);
const FormCtx = createContext<ActionState & { pending?: boolean }>({});
export const useFormState = () => useContext(FormCtx);

export function ActionForm({ action, children, className, resetOnOk, id, encType, onOk, "aria-label": ariaLabel }: { action: Action; children: ReactNode; className?: string; resetOnOk?: boolean; id?: string; encType?: string; onOk?: (s: ActionState) => void; "aria-label"?: string }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const seen = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state.at || state.at === seen.current) return;
    seen.current = state.at;
    if (state.ok) {
      if (resetOnOk) ref.current?.reset();
      onOk?.(state);
    }
  }, [state, resetOnOk, onOk]);
  return (
    <FormCtx.Provider value={{ ...state, pending: isPending }}>
      {/* onSubmit dispatches the action itself: React 19 would otherwise RESET all uncontrolled fields after every
          action — including failed ones, wiping what the editor typed. The action prop stays for Next's markup. */}
      <form
        ref={ref}
        id={id}
        action={formAction}
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
          startTransition(() => formAction(data));
        }}
        className={className}
        encType={encType}
        aria-label={ariaLabel}
        noValidate
      >
        {children}
      </form>
    </FormCtx.Provider>
  );
}

/** Status line for the surrounding ActionForm. */
export function FormMessage({ className }: { className?: string }) {
  const s = useFormState();
  if (!s.ok && !s.error) return <p aria-live="polite" className="sr-only" />;
  return (
    <p role={s.error ? "alert" : "status"} aria-live="polite" className={cn("flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium", s.error ? "bg-signal/10 text-signal" : "bg-success-50 text-success", className)}>
      {s.error ? <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
      <span>{s.error ?? s.ok}</span>
    </p>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingText, name, value, icon, ...rest }: { children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md"; className?: string; pendingText?: string; name?: string; value?: string; icon?: ReactNode } & Omit<ComponentProps<"button">, "type">) {
  const pending = useFormState().pending ?? false;
  // enabled only after hydration: a click before that would submit natively AND be replayed by React (double action)
  const ready = useHydrated();
  return (
    <button type="submit" name={name} value={value} {...rest} disabled={!ready || pending || rest.disabled} aria-disabled={pending || undefined} className={buttonClass(variant, size, className)}>
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : icon}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** Two-step submit for consequential actions: first click arms it, second click submits. */
export function ConfirmSubmit({ children, confirmText = "Emin misiniz? Onaylamak için tekrar tıklayın", variant = "outline", size = "sm", name, value, className }: { children: ReactNode; confirmText?: string; variant?: ButtonVariant; size?: "sm" | "md"; name?: string; value?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  const pending = useFormState().pending ?? false;
  const ready = useHydrated();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed)
    return (
      // key: a NEW element for the armed state — reusing the DOM node would turn it into a submit button during this
      // very click, and the browser would submit as the click's default action (arm + submit in one click)
      <button
        key="arm"
        type="button"
        disabled={!ready}
        onClick={(e) => {
          e.preventDefault();
          setArmed(true);
        }}
        className={buttonClass(variant, size, className)}
      >
        {children}
      </button>
    );
  return (
    <button key="confirm" type="submit" name={name} value={value} disabled={pending} autoFocus className={buttonClass(variant === "outline" ? "danger" : variant, size, className)}>
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
      {confirmText}
    </button>
  );
}

// field wrappers reading their error from the form state
export function Input({ name, ...rest }: { name: string; label: string } & Omit<ComponentProps<typeof TextField>, "name" | "error">) {
  const s = useFormState();
  return <TextField name={name} error={s.fields?.[name]} {...rest} />;
}
export function Area({ name, ...rest }: { name: string; label: string } & Omit<ComponentProps<typeof TextArea>, "name" | "error">) {
  const s = useFormState();
  return <TextArea name={name} error={s.fields?.[name]} {...rest} />;
}
export function Select({ name, ...rest }: { name: string; label: string } & Omit<ComponentProps<typeof SelectField>, "name" | "error">) {
  const s = useFormState();
  return <SelectField name={name} error={s.fields?.[name]} {...rest} />;
}
export function Check({ name, label, hint, defaultChecked, value = "on", disabled }: { name: string; label: ReactNode; hint?: string; defaultChecked?: boolean; value?: string; disabled?: boolean }) {
  const s = useFormState();
  const err = s.fields?.[name];
  return (
    <div className="space-y-1">
      <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-ink">
        <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} disabled={disabled} aria-invalid={err ? true : undefined} className="mt-0.5 size-5 shrink-0 accent-brand-700" />
        <span>
          <span className="font-semibold">{label}</span>
          {hint ? <span className="block text-xs text-steel">{hint}</span> : null}
        </span>
      </label>
      {err ? (
        <p role="alert" className="text-xs font-medium text-signal">
          {err}
        </p>
      ) : null}
    </div>
  );
}

/** Shows a one-time value returned by the action (e.g. an invitation link) with a copy button. Never persisted client-side. */
export function OneTimeValue({ k, label, hint }: { k: string; label: string; hint?: string }) {
  const s = useFormState();
  const [copied, setCopied] = useState(false);
  const raw = s.data?.[k];
  if (!raw) return null;
  const value = raw.startsWith("/") && typeof window !== "undefined" ? `${window.location.origin}${raw}` : raw;
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-warning/50 bg-warning-50 p-3">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2 font-mono text-xs" />
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(value).then(() => setCopied(true))}
          className={buttonClass("secondary", "sm")}
        >
          {copied ? "Kopyalandı" : "Kopyala"}
        </button>
      </div>
      {hint ? <p className="text-xs text-steel">{hint}</p> : null}
    </div>
  );
}

/** Counter for SEO-length fields (title ≈ 30–60, description ≈ 70–160 characters). */
export function LengthHint({ forId, min, max }: { forId: string; min: number; max: number }) {
  const [len, setLen] = useState<number | null>(null);
  useEffect(() => {
    const el = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    const update = () => setLen(el.value.length);
    update();
    el.addEventListener("input", update);
    return () => el.removeEventListener("input", update);
  }, [forId]);
  if (len === null) return null;
  const tone = len === 0 ? "text-steel" : len < min || len > max ? "text-warning" : "text-success";
  return (
    <p dir="ltr" className={cn("text-start text-xs tabular-nums", tone)} aria-live="polite">
      {len} karakter · önerilen {min}–{max}
      {len > max ? " (arama sonuçlarında kısaltılabilir)" : len > 0 && len < min ? " (kısa)" : ""}
    </p>
  );
}
