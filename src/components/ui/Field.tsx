import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const control =
  "block w-full min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface px-3.5 text-[0.9375rem] text-ink placeholder:text-steel/80 transition-colors duration-200 focus:border-brand-600 focus:outline-none focus-visible:outline-3 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-surface-2 aria-[invalid=true]:border-signal";

type FieldShell = { label: string; hint?: string; error?: string; required?: boolean; className?: string };

function Shell({ id, label, hint, error, required, className, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span aria-hidden="true" className="ms-0.5 text-signal">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-steel">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-signal">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) => [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

export function TextField({ label, hint, error, required, className, id: idProp, ...rest }: FieldShell & ComponentProps<"input">) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <input id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={control} {...rest} />
    </Shell>
  );
}

export function TextArea({ label, hint, error, required, className, id: idProp, ...rest }: FieldShell & ComponentProps<"textarea">) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <textarea id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(control, "min-h-32 py-3")} {...rest} />
    </Shell>
  );
}

export function SelectField({ label, hint, error, required, className, id: idProp, children, ...rest }: FieldShell & ComponentProps<"select">) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <Shell id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <select id={id} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={cn(control, "pe-9")} {...rest}>
        {children}
      </select>
    </Shell>
  );
}
