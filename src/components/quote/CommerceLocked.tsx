import { Lock } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

/** Shown on cart/checkout while paid checkout is locked — no payment methods, no IBANs, no "complete order". */
export function CommerceLocked({ title, text, cta, href }: { title: string; text: string; cta: string; href: string }) {
  return (
    <div role="status" className="mx-auto max-w-2xl rounded-[var(--radius-xl)] border border-line bg-surface-2 p-8 text-center">
      <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-surface text-brand-700 dark:text-brand-300">
        <Lock aria-hidden="true" className="size-6" />
      </span>
      <h2 className="mt-4 text-h3 font-bold text-ink">{title}</h2>
      <p className="mt-2 text-steel">{text}</p>
      <ButtonLink href={href} className="mt-6">
        {cta}
      </ButtonLink>
    </div>
  );
}
