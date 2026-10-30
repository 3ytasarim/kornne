"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowLeft, Check, CheckCircle2, Copy, Landmark, Loader2, Lock, PackageSearch, ReceiptText, ShoppingCart } from "lucide-react";
import { placeOrderAction, priceCartAction, type PlaceOrderState, type PricedCart } from "@/app/[locale]/odeme/actions";
import { BankAccountList } from "@/components/shop/BankAccountList";
import { CheckoutSteps } from "@/components/shop/CheckoutSteps";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { EmptyState, Skeleton } from "@/components/ui/States";
import type { PublicBankAccount } from "@/lib/commerce/bank-accounts";
import { money } from "@/lib/commerce/money-client";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { quoteList, useQuoteList } from "@/lib/quote/store";

type Shop = Dictionary["shop"];
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * B2B checkout (EFT / Havale). Billing form → placeOrderAction (server re-prices, idempotency key, honeypot, min fill time)
 * → success view with the order number, amount due and the company bank accounts. No card data is ever requested.
 */
export function CheckoutView({ locale, s, banks, hrefs }: { locale: Locale; s: Shop; banks: PublicBankAccount[]; hrefs: { cart: string; notice: string; status: string; terms: string; privacy: string; browse: string } }) {
  const hydrated = useHydrated();
  const lines = useQuoteList();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [pending, start] = useTransition();
  const [placing, startPlace] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; totalMinor: string } | null>(null);
  const [sameShipping, setSameShipping] = useState(true);
  const keyRef = useRef<string | null>(null);
  const startedRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const key = JSON.stringify(lines.map((l) => [l.productRef, l.variantId, l.quantity]));

  useEffect(() => {
    if (!lines.length) return;
    start(async () => setPriced(await priceCartAction(lines.map((l) => ({ productRef: l.productRef, variantId: l.variantId, quantity: l.quantity }))).catch((): PricedCart => ({ ok: false, code: "error" }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-price only when refs/quantities change
  }, [key]);

  const header = (step: number) => (
    <header className="mt-6 mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <h1 className="font-display text-h1 font-bold text-ink">{step === 2 ? s.success.title : s.checkout.title}</h1>
        <p className="mt-2 text-steel">{step === 2 ? s.success.lead : s.checkout.lead}</p>
      </div>
      <CheckoutSteps steps={s.checkout.steps} current={step} label={s.checkout.title} />
    </header>
  );
  if (!hydrated) return <>{header(1)}<Skeleton className="h-96" /></>;
  if (done) return <>{header(2)}<OrderPlaced locale={locale} s={s} banks={banks} order={done} hrefs={hrefs} /></>;
  if (!lines.length) return <EmptyState icon={<ShoppingCart aria-hidden="true" className="size-7" />} title={s.cart.empty} text={s.cart.emptyText} action={<ButtonLink href={hrefs.browse}>{s.cart.browse}</ButtonLink>} />;

  const ok = priced?.ok ? priced : null;
  const err = (k: string) => (errors[k] ? ((s.errors as Record<string, string>)[errors[k]!] ?? s.errors.invalid) : undefined);
  const touch = () => {
    startedRef.current ??= Date.now();
    keyRef.current ??= crypto.randomUUID();
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    touch();
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => String(fd.get(k) ?? "");
    setFormError(null);
    startPlace(async () => {
      const res = await placeOrderAction({
        locale,
        company: str("company"),
        taxOffice: str("taxOffice"),
        taxNumber: str("taxNumber"),
        contactName: str("contactName"),
        email: str("email"),
        phone: str("phone"),
        city: str("city"),
        district: str("district"),
        address: str("address"),
        shippingSame: sameShipping,
        shippingAddress: sameShipping ? "" : str("shippingAddress"),
        note: str("note"),
        acceptTerms: (fd.get("acceptTerms") === "on") as true,
        items: lines.map((l) => ({ productRef: l.productRef, variantId: l.variantId, quantity: l.quantity })),
        idempotencyKey: keyRef.current!,
        website: str("website"),
        startedAt: startedRef.current!,
      }).catch((): PlaceOrderState => ({ ok: false, code: "error" }));
      if (res.ok) {
        quoteList.clear();
        setDone({ number: res.number, totalMinor: res.totalMinor });
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.code === "validation" && res.fields) {
        setErrors(res.fields);
        const first = Object.keys(res.fields)[0];
        if (first === "items") setFormError(s.errors.notPurchasable);
        else if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
        return;
      }
      setFormError(res.code === "rate" ? s.errors.rate : res.code === "closed" ? s.errors.closed : res.code === "not_purchasable" ? s.errors.notPurchasable : s.errors.generic);
    });
  };

  return (
    <>
    {header(1)}
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <form ref={formRef} onSubmit={submit} onFocus={touch} noValidate className="space-y-6" data-checkout-form>
        {formError ? (
          <p role="alert" className="rounded-[var(--radius-md)] border border-signal/30 bg-signal-50 px-4 py-3 text-sm text-signal-ink">
            {formError}
          </p>
        ) : null}
        <fieldset className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
          <legend className="px-1 text-lg font-bold text-ink">{s.checkout.billing}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label={s.checkout.company} name="company" autoComplete="organization" required maxLength={160} error={err("company")} />
            <TextField label={s.checkout.taxOffice} name="taxOffice" required maxLength={80} error={err("taxOffice")} />
            <TextField label={s.checkout.taxNumber} name="taxNumber" inputMode="numeric" dir="ltr" required maxLength={14} hint={s.checkout.taxNumberHint} error={err("taxNumber")} />
          </div>
        </fieldset>
        <fieldset className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
          <legend className="px-1 text-lg font-bold text-ink">{s.checkout.contact}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label={s.checkout.contactName} name="contactName" autoComplete="name" required maxLength={120} error={err("contactName")} />
            <TextField label={s.checkout.email} name="email" type="email" autoComplete="email" dir="ltr" required maxLength={160} error={err("email")} />
            <TextField label={s.checkout.phone} name="phone" type="tel" autoComplete="tel" dir="ltr" required maxLength={25} error={err("phone")} />
          </div>
        </fieldset>
        <fieldset className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
          <legend className="px-1 text-lg font-bold text-ink">{s.checkout.address}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <TextField label={s.checkout.city} name="city" autoComplete="address-level1" required maxLength={60} error={err("city")} />
            <TextField label={s.checkout.district} name="district" autoComplete="address-level2" required maxLength={60} error={err("district")} />
            <TextArea className="sm:col-span-2" label={s.checkout.billingAddress} name="address" autoComplete="street-address" required maxLength={400} rows={3} error={err("address")} />
            <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-medium text-ink sm:col-span-2">
              <input type="checkbox" checked={sameShipping} onChange={(e) => setSameShipping(e.target.checked)} className="size-5 accent-brand-700" />
              {s.checkout.shippingSame}
            </label>
            {!sameShipping ? <TextArea className="sm:col-span-2" label={s.checkout.shippingAddress} name="shippingAddress" maxLength={400} rows={3} error={err("shippingAddress")} /> : null}
            <TextArea className="sm:col-span-2" label={s.checkout.note} name="note" maxLength={1000} rows={3} hint={s.checkout.noteHint} />
          </div>
        </fieldset>
        {/* honeypot: hidden from people and assistive tech */}
        <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="checkout-website">Website</label>
          <input id="checkout-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" name="acceptTerms" aria-invalid={errors.acceptTerms ? true : undefined} aria-describedby={errors.acceptTerms ? "accept-error" : undefined} className="mt-0.5 size-5 shrink-0 accent-brand-700" />
            <span>
              {s.checkout.accept}{" "}
              <a href={hrefs.terms} hrefLang="tr" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-300">
                {s.checkout.termsLink}
              </a>
              {" · "}
              <a href={hrefs.privacy} hrefLang="tr" target="_blank" className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-300">
                {s.checkout.privacyLink}
              </a>
            </span>
          </label>
          {errors.acceptTerms ? (
            <p id="accept-error" role="alert" className="text-xs font-medium text-signal-ink">
              {s.errors.acceptTerms}
            </p>
          ) : null}
          <p className="text-xs text-steel">{s.checkout.legalDraft}</p>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href={hrefs.cart} className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <ArrowLeft aria-hidden="true" className="size-4 rtl:-scale-x-100" />
            {s.checkout.backToCart}
          </Link>
          <Button type="submit" size="lg" disabled={placing || !ok} icon={placing ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Lock aria-hidden="true" className="size-4" />}>
            {placing ? s.checkout.placing : s.checkout.place}
          </Button>
        </div>
      </form>

      <aside aria-labelledby="checkout-summary" className="rounded-[var(--radius-xl)] border border-line bg-surface-2 p-6 lg:sticky lg:top-36">
        <h2 id="checkout-summary" className="text-h3 font-bold text-ink">
          {s.cart.summary}
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {lines.map((l) => {
            const p = ok?.lines.find((x) => x.productRef === l.productRef && x.variantId === l.variantId);
            return (
              <li key={`${l.productRef}|${l.variantId ?? ""}`} className="flex items-center gap-3 py-3">
                <span className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">{l.image ? <Image src={l.image} alt="" fill sizes="56px" className="object-contain p-1" /> : null}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium text-ink">{l.title}</span>
                  <span className="text-xs text-steel">× {l.quantity}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-ink tabular-nums" dir="ltr">
                  {p ? money(p.lineMinor, locale) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        <dl aria-busy={pending} className="mt-2 space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-steel">{s.cart.net}</dt>
            <dd className="text-ink tabular-nums" dir="ltr">
              {ok ? money(ok.netMinor, locale) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-steel">{format(s.cart.vat, { rate: ok?.lines[0] ? ok.lines[0].vatRateBp / 100 : 20 })}</dt>
            <dd className="text-ink tabular-nums" dir="ltr">
              {ok ? money(ok.vatMinor, locale) : "—"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
            <dt className="font-semibold text-ink">{s.cart.total}</dt>
            <dd className="text-2xl font-bold tracking-tight text-ink tabular-nums" dir="ltr" data-testid="checkout-total">
              {ok ? money(ok.totalMinor, locale) : s.cart.calculating}
            </dd>
          </div>
        </dl>
        {priced && !priced.ok ? (
          <p role="alert" className="mt-4 rounded-[var(--radius-md)] bg-signal-50 p-3 text-sm text-signal-ink">
            {priced.code === "variant" ? s.cart.variantNeeded : s.cart.unavailable}
          </p>
        ) : null}
        <p className="mt-5 flex gap-2 rounded-[var(--radius-md)] bg-surface p-3 text-sm text-ink-2">
          <Landmark aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" />
          {s.cart.secure}
        </p>
      </aside>
    </div>
    </>
  );
}

function OrderPlaced({ locale, s, banks, order, hrefs }: { locale: Locale; s: Shop; banks: PublicBankAccount[]; order: { number: string; totalMinor: string }; hrefs: { notice: string; status: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-4xl space-y-8" data-testid="order-placed">
      <div role="status" className="rounded-[var(--radius-xl)] border border-success/30 bg-success-50 p-6 text-center sm:p-10">
        <CheckCircle2 aria-hidden="true" className="mx-auto size-12 text-success" />
        <p className="mt-3 font-semibold text-ink">{s.success.title}</p>
        <dl className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] bg-surface p-5 text-start shadow-sm">
            <dt className="text-sm text-steel">{s.success.number}</dt>
            <dd className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-lg font-bold whitespace-nowrap text-ink select-all sm:text-xl" dir="ltr" data-testid="order-number">
                {order.number}
              </span>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(order.number);
                    setCopied(true);
                  } catch {
                    /* selectable fallback */
                  }
                }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-brand-700 ring-1 ring-line hover:ring-brand-600 dark:text-brand-300"
              >
                {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                <span aria-live="polite">{copied ? s.success.copied : s.success.copy}</span>
              </button>
            </dd>
          </div>
          <div className="rounded-[var(--radius-lg)] bg-surface p-5 text-start shadow-sm">
            <dt className="text-sm text-steel">{s.success.amount}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight text-ink tabular-nums" dir="ltr" data-testid="order-total">
              {money(order.totalMinor, locale)}
            </dd>
          </div>
        </dl>
        <p className="mx-auto mt-4 max-w-xl text-xs text-steel">{s.success.saveHint}</p>
      </div>

      <section aria-labelledby="pay-to">
        <h2 id="pay-to" className="mb-4 text-h3 font-bold text-ink">
          {s.banks.title}
        </h2>
        {banks.length ? <BankAccountList accounts={banks} labels={s.banks} /> : <p className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5 text-ink-2">{s.banks.pending}</p>}
      </section>

      <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
        <p className="text-ink-2">{s.success.next}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href={hrefs.notice} icon={<ReceiptText aria-hidden="true" className="size-5" />}>
            {s.success.notify}
          </ButtonLink>
          <ButtonLink href={hrefs.status} variant="outline" icon={<PackageSearch aria-hidden="true" className="size-5" />}>
            {s.success.track}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
