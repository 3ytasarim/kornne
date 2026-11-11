"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, ReceiptText, Search, XCircle } from "lucide-react";
import { lookupOrderAction, type OrderStatusState } from "@/app/[locale]/odeme/actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { money } from "@/lib/commerce/money-client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/cn";

type Shop = Dictionary["shop"];
const STEPS = ["AWAITING_PAYMENT", "PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

/** Legacy /siparisim-ne-durumda: order number + e-mail (a number alone reveals nothing). Same answer for unknown/wrong. */
export function OrderStatusView({ locale, s, noticeHref }: { locale: Locale; s: Shop; noticeHref: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<OrderStatusState | null>(null);
  const fields = res && !res.ok ? (res.fields ?? {}) : {};
  const err = (k: string) => (fields[k] ? ((s.errors as Record<string, string>)[fields[k]!] ?? s.errors.invalid) : undefined);

  return (
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => setRes(await lookupOrderAction({ number: String(fd.get("number") ?? ""), email: String(fd.get("email") ?? "") }).catch((): OrderStatusState => ({ ok: false, code: "error" }))));
        }}
        className="space-y-4 rounded-[var(--radius-xl)] border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
      >
        <TextField label={s.status.number} name="number" placeholder={s.status.numberHint} dir="ltr" autoCapitalize="characters" required maxLength={24} error={err("number")} />
        <TextField label={s.status.email} name="email" type="email" autoComplete="email" dir="ltr" required maxLength={160} error={err("email")} />
        <Button type="submit" size="lg" className="w-full" disabled={pending} icon={pending ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Search aria-hidden="true" className="size-5" />}>
          {pending ? s.status.querying : s.status.query}
        </Button>
      </form>

      <div aria-live="polite">
        {res && !res.ok && res.code !== "validation" ? (
          <p role="alert" className="rounded-[var(--radius-lg)] border border-signal/30 bg-signal-50 p-5 text-signal-ink">
            {res.code === "not_found" ? s.errors.notFound : res.code === "rate" ? s.errors.rate : s.errors.generic}
          </p>
        ) : null}
        {res?.ok ? <OrderCard locale={locale} s={s} order={res.order} noticeHref={noticeHref} /> : null}
      </div>
    </div>
  );
}

function OrderCard({ locale, s, order, noticeHref }: { locale: Locale; s: Shop; order: Extract<OrderStatusState, { ok: true }>["order"]; noticeHref: string }) {
  const cancelled = order.status === "CANCELLED" || order.status === "REFUNDED";
  const reached = STEPS.indexOf(order.status as (typeof STEPS)[number]);
  const label = (s.status.labels as Record<string, string>)[order.status] ?? order.status;
  return (
    <article className="rounded-[var(--radius-xl)] border border-line bg-surface p-6" data-testid="order-status">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-lg font-bold tracking-wider text-ink" dir="ltr">
            {order.number}
          </p>
          <p className="text-sm text-steel">
            {s.status.placedAt}: {new Date(order.placedAt).toLocaleDateString(locale === "tr" ? "tr-TR" : locale, { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
        <span className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", cancelled ? "bg-signal-50 text-signal-ink" : order.status === "AWAITING_PAYMENT" ? "bg-warning-50 text-warning" : "bg-success-50 text-success")} data-testid="order-status-label">
          {label}
        </span>
      </header>

      {cancelled ? (
        <p className="mt-6 flex items-center gap-2 text-signal-ink">
          <XCircle aria-hidden="true" className="size-5" />
          {label}
        </p>
      ) : (
        <ol className="mt-8 grid gap-3 sm:grid-cols-5">
          {s.status.timeline.map((t, i) => {
            const done = i <= reached;
            return (
              <li key={t} aria-current={i === reached ? "step" : undefined} className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", done ? "bg-brand-700 text-white" : "border border-line-strong text-steel")}>{done ? <Check aria-hidden="true" className="size-4" /> : i + 1}</span>
                <span className={cn("text-sm", done ? "font-semibold text-ink" : "text-steel")}>{t}</span>
              </li>
            );
          })}
        </ol>
      )}

      {order.status === "AWAITING_PAYMENT" ? (
        order.notified ? (
          <p className="mt-6 rounded-[var(--radius-md)] bg-surface-2 p-4 text-sm text-ink-2">{s.status.noticeReceived}</p>
        ) : (
          <div className="mt-6">
            <ButtonLink href={noticeHref} variant="outline" icon={<ReceiptText aria-hidden="true" className="size-4" />}>
              {s.status.payNow}
            </ButtonLink>
          </div>
        )
      ) : null}

      <h3 className="mt-8 mb-3 text-sm font-semibold text-steel uppercase">{s.status.items}</h3>
      <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
        {order.lines.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="min-w-0 text-ink">
              {l.title} <span className="text-steel">× {l.quantity}</span>
            </span>
            <span className="shrink-0 font-medium text-ink tabular-nums" dir="ltr">
              {money(l.lineTotalMinor, locale, order.currency)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-baseline justify-between text-ink">
        <span className="font-semibold">{s.status.total}</span>
        <span className="text-xl font-bold tabular-nums" dir="ltr">
          {money(order.totalMinor, locale, order.currency)}
        </span>
      </p>
    </article>
  );
}
