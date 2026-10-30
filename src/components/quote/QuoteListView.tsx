"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { CheckCircle2, ClipboardList, Loader2, Send, Trash2 } from "lucide-react";
import { submitQuoteAction } from "@/app/[locale]/teklif-listem/actions";
import { ButtonLink, Button } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { EmptyState, Skeleton } from "@/components/ui/States";
import { format } from "@/lib/i18n/format";
import { quoteList, useQuoteList } from "@/lib/quote/store";
import { trackLeadOnce } from "@/lib/analytics/client";
import { QuantityStepper } from "./QuantityStepper";

import type { Dictionary } from "@/lib/i18n/dictionaries";

type ListLabels = Dictionary["quoteList"];
type FormLabels = Dictionary["quoteForm"];
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);
// secure contexts only (localhost / https) — always true for this site
const newKey = () => crypto.randomUUID();

/**
 * Quote list + request form (Sprint 5). Lines come from localStorage (no personal data); the form posts to a
 * Server Action that re-validates everything and stores the request in Neon. Success shows a reference code —
 * never "order placed" / "paid" wording.
 */
export function QuoteListView({ locale, list, form, privacyHref, browseHref }: { locale: string; list: ListLabels; form: FormLabels; privacyHref: string; browseHref: string }) {
  const hydrated = useHydrated();
  const lines = useQuoteList();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const startedRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errorText = (code: string) => (code in form ? (form[code as keyof FormLabels] as string) : form.required);

  if (!hydrated) {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" className="rounded-[var(--radius-xl)] border border-success/30 bg-success-50 p-8 text-center">
        <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-success" />
        <h2 className="mt-3 text-h3 font-bold text-ink">{form.successTitle}</h2>
        <p className="mt-2 text-ink-2">{form.successText}</p>
        <p className="mt-3 font-mono text-2xl font-bold tracking-wider text-ink" data-testid="quote-reference">
          {done}
        </p>
        <Button variant="outline" className="mt-6 bg-surface" onClick={() => setDone(null)}>
          {form.newRequest}
        </Button>
      </div>
    );
  }

  if (!lines.length) {
    return <EmptyState icon={<ClipboardList aria-hidden="true" className="size-7" />} title={list.empty} text={list.emptyText} action={<ButtonLink href={browseHref}>{list.browse}</ButtonLink>} />;
  }

  const onFocusForm = () => {
    startedRef.current ??= Date.now();
    keyRef.current ??= newKey();
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onFocusForm();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "");
    setFormError(null);
    start(async () => {
      const res = await submitQuoteAction({
        locale: locale as never,
        name: str("name"),
        company: str("company"),
        email: str("email"),
        phone: str("phone"),
        message: str("message"),
        website: str("website"),
        items: lines.map((l) => ({ productRef: l.productRef, variantId: l.variantId, quantity: l.quantity })),
        idempotencyKey: keyRef.current!,
        startedAt: startedRef.current!,
        source: "QUOTE_LIST",
      }).catch(() => ({ ok: false as const, code: "error" as const }));
      if (res.ok) {
        // conversion: the request is STORED (reference issued) — once per reference, no personal data, no reference
        trackLeadOnce(res.reference, { lead_source: "quote_list", items_count: lines.length });
        quoteList.clear();
        keyRef.current = null;
        startedRef.current = null;
        setErrors({});
        setDone(res.reference);
        return;
      }
      if (res.code === "validation") {
        setErrors(res.fields);
        const first = Object.keys(res.fields)[0];
        if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
        if (res.fields.items) setFormError(form.errorItems);
        return;
      }
      setFormError(res.code === "rate" ? form.errorRate : res.code === "items" ? form.errorItems : form.errorGeneric);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section aria-labelledby="quote-lines">
        <h2 id="quote-lines" className="mb-4 text-h3 font-bold text-ink">
          {format(list.items, { count: lines.length })}
        </h2>
        <ul className="divide-y divide-line rounded-[var(--radius-lg)] border border-line bg-surface">
          {lines.map((l) => (
            <li key={`${l.productRef}|${l.variantId ?? ""}`} className="flex gap-4 p-4">
              <span className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-surface-2">{l.image ? <Image src={l.image} alt="" fill sizes="80px" className="object-contain p-1.5" /> : null}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Link href={l.href} className="line-clamp-2 font-semibold text-ink hover:text-brand-700">
                  {l.title}
                </Link>
                {l.variantLabel ? (
                  <p className="text-sm text-steel">
                    {list.option}: {l.variantLabel}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap items-center gap-3">
                  <QuantityStepper size="sm" value={l.quantity} onChange={(n) => quoteList.setQuantity(l, n)} labels={{ quantity: `${list.quantity} — ${l.title}`, decrease: list.decrease, increase: list.increase }} />
                  <button type="button" onClick={() => quoteList.remove(l)} aria-label={`${list.remove}: ${l.title}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-sm font-medium text-steel hover:text-signal">
                    <Trash2 aria-hidden="true" className="size-4" />
                    <span className="hidden sm:inline">{list.remove}</span>
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="quote-form-title" className="h-fit rounded-[var(--radius-xl)] border border-line bg-surface-2 p-6 lg:sticky lg:top-28">
        <h2 id="quote-form-title" className="text-h3 font-bold text-ink">
          {form.title}
        </h2>
        <form data-quote-form ref={formRef} onSubmit={submit} onFocus={onFocusForm} noValidate className="mt-5 space-y-4">
          {formError ? (
            <p role="alert" className="rounded-[var(--radius-md)] border border-signal/30 bg-signal-50 px-4 py-3 text-sm text-signal">
              {formError}
            </p>
          ) : null}
          <TextField label={form.name} name="name" autoComplete="name" required maxLength={120} error={errors.name ? errorText(errors.name) : undefined} />
          <TextField label={form.company} name="company" autoComplete="organization" maxLength={160} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={form.email} name="email" type="email" autoComplete="email" dir="ltr" maxLength={160} hint={form.contactHint} error={errors.email ? errorText(errors.email) : undefined} />
            <TextField label={form.phone} name="phone" type="tel" autoComplete="tel" dir="ltr" maxLength={25} error={errors.phone ? errorText(errors.phone) : undefined} />
          </div>
          <TextArea label={form.message} name="message" maxLength={2000} hint={form.messageHint} />
          {/* honeypot: hidden from people and assistive tech */}
          <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
            <label htmlFor="quote-website">Website</label>
            <input id="quote-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <p className="text-xs leading-relaxed text-steel">
            {form.privacy}{" "}
            <a href={privacyHref} hrefLang="tr" className="font-semibold text-brand-600 underline underline-offset-2">
              {form.privacyLink}
            </a>
          </p>
          <Button type="submit" size="lg" disabled={pending} className="w-full" icon={pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}>
            {pending ? form.sending : form.submit}
          </Button>
        </form>
      </section>
    </div>
  );
}
