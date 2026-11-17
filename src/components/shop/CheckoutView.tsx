"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowLeft, Check, CheckCircle2, Clock, Copy, CreditCard, Landmark, Loader2, Lock, PackageSearch, ReceiptText, ShoppingCart, XCircle } from "lucide-react";
import { placeOrderAction, priceCartAction, retryCardPaymentAction, type PlaceOrderState, type PricedCart } from "@/app/[locale]/odeme/actions";
import { BankAccountList } from "@/components/shop/BankAccountList";
import { CheckoutSteps } from "@/components/shop/CheckoutSteps";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextArea, TextField } from "@/components/ui/Field";
import { EmptyState, Skeleton } from "@/components/ui/States";
import type { PublicBankAccount } from "@/lib/commerce/bank-accounts";
import { money } from "@/lib/commerce/money-client";
import { displayCurrency } from "@/lib/fx/convert";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import { format } from "@/lib/i18n/format";
import { quoteList, useQuoteList } from "@/lib/quote/store";

type Shop = Dictionary["shop"];
const noop = () => () => {};
const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

export type CardResult = { status: "ok" | "review" | "fail" | "start"; number: string | null };

/**
 * B2B checkout. Billing form → placeOrderAction (server re-prices, idempotency key, honeypot, min fill time), then
 *  - EFT / Havale: success view with the order number, amount due and the company bank accounts
 *  - card (only when iyzico is configured): redirect to iyzico's hosted payment page; the result comes back as
 *    ?sonuc=ok|review|fail&no=… (settled server-side). No card data is ever requested on this site.
 */
export function CheckoutView({ locale, s, banks, hrefs, cardEnabled = false, result = null }: { locale: Locale; s: Shop; banks: PublicBankAccount[]; hrefs: { cart: string; notice: string; status: string; terms: string; privacy: string; browse: string }; cardEnabled?: boolean; result?: CardResult | null }) {
  const hydrated = useHydrated();
  const lines = useQuoteList();
  const [priced, setPriced] = useState<PricedCart | null>(null);
  const [pending, start] = useTransition();
  const [placing, startPlace] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; totalMinor: string; currency: string } | null>(null);
  const [sameShipping, setSameShipping] = useState(true);
  const [method, setMethod] = useState<"CARD" | "BANK_TRANSFER">(cardEnabled ? "CARD" : "BANK_TRANSFER");
  const [redirecting, setRedirecting] = useState(false);
  const [cardResult, setCardResult] = useState<CardResult | null>(result);
  const keyRef = useRef<string | null>(null);
  const startedRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const key = JSON.stringify(lines.map((l) => [l.productRef, l.variantId, l.quantity]));

  useEffect(() => {
    if (!lines.length) return;
    start(async () => setPriced(await priceCartAction(lines.map((l) => ({ productRef: l.productRef, variantId: l.variantId, quantity: l.quantity })), locale).catch((): PricedCart => ({ ok: false, code: "error" }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-price only when refs/quantities change
  }, [key]);

  const header = (step: number, lead = true) => (
    <header className="mt-6 mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <h1 className="font-display text-h1 font-bold text-ink">{step === 2 ? s.success.title : s.checkout.title}</h1>
        {lead ? <p className="mt-2 text-steel">{step === 2 ? s.success.lead : s.checkout.lead}</p> : null}
      </div>
      <CheckoutSteps steps={s.checkout.steps} current={step} label={s.checkout.title} />
    </header>
  );
  if (cardResult) return <>{header(2, false)}<CardPaymentResult s={s} result={cardResult} hrefs={hrefs} cardEnabled={cardEnabled} /></>;
  if (!hydrated) return <>{header(1)}<Skeleton className="h-96" /></>;
  if (done) return <>{header(2)}<OrderPlaced locale={locale} s={s} banks={banks} order={done} hrefs={hrefs} /></>;
  if (!lines.length) return <EmptyState icon={<ShoppingCart aria-hidden="true" className="size-7" />} title={s.cart.empty} text={s.cart.emptyText} action={<ButtonLink href={hrefs.browse}>{s.cart.browse}</ButtonLink>} />;

  const ok = priced?.ok ? priced : null;
  const cur = ok?.currency ?? displayCurrency(locale);
  // foreign-language orders are paid in USD → only possible once a USD account is published (Admin › Banka hesapları)
  const noAccount = method === "BANK_TRANSFER" && cur !== "TRY" && !banks.some((b) => b.currency === cur);
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
        paymentMethod: method,
      }).catch((): PlaceOrderState => ({ ok: false, code: "error" }));
      if (res.ok && res.redirectUrl) {
        quoteList.clear();
        setRedirecting(true);
        window.location.assign(res.redirectUrl);
        return;
      }
      if (res.ok && res.paymentStartFailed) {
        quoteList.clear();
        setCardResult({ status: "start", number: res.number });
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.ok) {
        quoteList.clear();
        setDone({ number: res.number, totalMinor: res.totalMinor, currency: res.currency });
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
      setFormError(res.code === "rate" ? s.errors.rate : res.code === "closed" ? s.errors.closed : res.code === "not_purchasable" ? s.errors.notPurchasable : res.code === "no_account" ? s.errors.noAccount : s.errors.generic);
    });
  };

  return (
    <>
    {header(1)}
    <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <form ref={formRef} onSubmit={submit} onFocus={touch} noValidate className="space-y-6" data-checkout-form>
        {noAccount ? (
          <p role="alert" className="rounded-[var(--radius-md)] border border-warning/40 bg-warning-50 px-4 py-3 text-sm text-ink">
            {s.errors.noAccount}
          </p>
        ) : null}
        {formError ? (
          <p role="alert" className="rounded-[var(--radius-md)] border border-signal/30 bg-signal-50 px-4 py-3 text-sm text-signal-ink">
            {formError}
          </p>
        ) : null}
        <fieldset className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
          <legend className="px-1 text-lg font-bold text-ink">{s.checkout.billing}</legend>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label={s.checkout.company} name="company" autoComplete="organization" required maxLength={160} error={err("company")} />
            {/* foreign companies: no Turkish tax office, free-form tax / VAT ID */}
            {locale === "tr" ? <TextField label={s.checkout.taxOffice} name="taxOffice" required maxLength={80} error={err("taxOffice")} /> : null}
            <TextField label={s.checkout.taxNumber} name="taxNumber" inputMode={locale === "tr" ? "numeric" : "text"} dir="ltr" required maxLength={locale === "tr" ? 14 : 30} hint={s.checkout.taxNumberHint} error={err("taxNumber")} />
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
            {/* Turkish pages: province / district; other languages: city / country (same fields, different labels) */}
            <TextField label={s.checkout.city} name="city" autoComplete={locale === "tr" ? "address-level1" : "address-level2"} required maxLength={60} error={err("city")} />
            <TextField label={s.checkout.district} name="district" autoComplete={locale === "tr" ? "address-level2" : "country-name"} required maxLength={60} error={err("district")} />
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
        {cardEnabled ? (
          <fieldset className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
            <legend className="px-1 text-lg font-bold text-ink">{s.payment.methodTitle}</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(
                [
                  { v: "CARD", icon: <CreditCard aria-hidden="true" className="size-5" />, label: s.payment.card, hint: s.payment.cardHint },
                  { v: "BANK_TRANSFER", icon: <Landmark aria-hidden="true" className="size-5" />, label: s.payment.transfer, hint: s.payment.transferHint },
                ] as const
              ).map((o) => (
                <label key={o.v} className={`flex min-h-12 cursor-pointer gap-3 rounded-[var(--radius-md)] border p-4 transition-colors ${method === o.v ? "border-brand-600 bg-brand-50 dark:bg-brand-950/40" : "border-line hover:border-brand-400"}`}>
                  <input type="radio" name="paymentMethod" value={o.v} checked={method === o.v} onChange={() => setMethod(o.v)} className="mt-0.5 size-5 shrink-0 accent-brand-700" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      {o.icon}
                      {o.label}
                    </span>
                    <span className="mt-1 block text-xs text-steel">{o.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
            <input type="checkbox" name="acceptTerms" aria-invalid={errors.acceptTerms ? true : undefined} aria-describedby={errors.acceptTerms ? "accept-error" : undefined} className="mt-0.5 size-5 shrink-0 accent-brand-700" />
            <span>
              {s.checkout.accept}{" "}
              <a href={hrefs.terms} target="_blank" className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-300">
                {s.checkout.termsLink}
              </a>
              {" · "}
              <a href={hrefs.privacy} target="_blank" className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-300">
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
          <Button type="submit" size="lg" disabled={placing || redirecting || !ok || noAccount} icon={placing || redirecting ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Lock aria-hidden="true" className="size-4" />}>
            {redirecting ? s.payment.redirecting : placing ? s.checkout.placing : method === "CARD" ? s.payment.payCard : s.checkout.place}
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
                  {p ? money(p.lineMinor, locale, cur) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        <dl aria-busy={pending} className="mt-2 space-y-2 border-t border-line pt-4 text-sm">
          {/* VAT lines only on Turkish (TRY) pages — foreign orders carry no VAT */}
          {locale === "tr" ? (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-steel">{s.cart.net}</dt>
                <dd className="text-ink tabular-nums" dir="ltr">
                  {ok ? money(ok.netMinor, locale, cur) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-steel">{format(s.cart.vat, { rate: ok?.lines[0] ? ok.lines[0].vatRateBp / 100 : 20 })}</dt>
                <dd className="text-ink tabular-nums" dir="ltr">
                  {ok ? money(ok.vatMinor, locale, cur) : "—"}
                </dd>
              </div>
            </>
          ) : null}
          {ok && ok.shippingMinor !== "0" ? (
            <div className="flex justify-between gap-4">
              <dt className="text-steel">{s.cart.shipping}</dt>
              <dd className="text-ink tabular-nums" dir="ltr" data-testid="shipping-total">
                {money(ok.shippingMinor, locale, cur)}
              </dd>
            </div>
          ) : null}
          <div className={locale === "tr" ? "flex items-baseline justify-between gap-4 border-t border-line pt-3" : "flex items-baseline justify-between gap-4"}>
            <dt className="font-semibold text-ink">{s.cart.total}</dt>
            <dd className="text-2xl font-bold tracking-tight text-ink tabular-nums" dir="ltr" data-testid="checkout-total">
              {ok ? money(ok.totalMinor, locale, cur) : s.cart.calculating}
            </dd>
          </div>
        </dl>
        {priced && !priced.ok ? (
          <p role="alert" className="mt-4 rounded-[var(--radius-md)] bg-signal-50 p-3 text-sm text-signal-ink">
            {priced.code === "variant" ? s.cart.variantNeeded : s.cart.unavailable}
          </p>
        ) : null}
        <p className="mt-5 flex gap-2 rounded-[var(--radius-md)] bg-surface p-3 text-sm text-ink-2">
          {method === "CARD" ? <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" /> : <Landmark aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700 dark:text-brand-300" />}
          {method === "CARD" ? s.payment.securedBy : s.cart.secure}
        </p>
      </aside>
    </div>
    </>
  );
}

function OrderPlaced({ locale, s, banks, order, hrefs }: { locale: Locale; s: Shop; banks: PublicBankAccount[]; order: { number: string; totalMinor: string; currency: string }; hrefs: { notice: string; status: string } }) {
  // only accounts in the order currency (TRY for Turkish orders, USD for the other languages)
  const payTo = banks.filter((b) => b.currency === order.currency);
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
              {money(order.totalMinor, locale, order.currency)}
            </dd>
          </div>
        </dl>
        <p className="mx-auto mt-4 max-w-xl text-xs text-steel">{s.success.saveHint}</p>
      </div>

      <section aria-labelledby="pay-to">
        <h2 id="pay-to" className="mb-4 text-h3 font-bold text-ink">
          {s.banks.title}
        </h2>
        {payTo.length ? <BankAccountList accounts={payTo} labels={s.banks} /> : <p className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5 text-ink-2">{s.banks.pending}</p>}
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

/** Outcome of a card payment (iyzico) — settled on the server before the customer lands here. */
function CardPaymentResult({ s, result, hrefs, cardEnabled }: { s: Shop; result: CardResult; hrefs: { status: string; notice: string }; cardEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ok = result.status === "ok";
  const review = result.status === "review";
  const canRetry = cardEnabled && !ok && !review && !!result.number;
  const tone = ok ? "border-success/30 bg-success-50" : review ? "border-warning/40 bg-warning-50" : "border-signal/30 bg-signal-50";
  const Icon = ok ? CheckCircle2 : review ? Clock : XCircle;
  const retry = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startBusy(async () => {
      const r = await retryCardPaymentAction({ number: result.number!, email }).catch(() => ({ ok: false as const, code: "error" as const }));
      if (r.ok) window.location.assign(r.redirectUrl);
      else setError(r.code === "rate" ? s.errors.rate : r.code === "not_found" || r.code === "validation" ? s.errors.invalid : s.errors.generic);
    });
  };
  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="card-result" data-status={result.status}>
      <div role="status" className={`rounded-[var(--radius-xl)] border p-6 text-center sm:p-10 ${tone}`}>
        <Icon aria-hidden="true" className={`mx-auto size-12 ${ok ? "text-success" : review ? "text-warning" : "text-signal"}`} />
        <p className="mt-3 text-xl font-bold text-ink">{ok ? s.payment.okTitle : review ? s.payment.reviewTitle : s.payment.failTitle}</p>
        <p className="mx-auto mt-2 max-w-xl text-ink-2">{ok ? s.payment.okText : review ? s.payment.reviewText : result.status === "start" ? s.payment.startFailed : s.payment.failText}</p>
        {result.number ? (
          <p className="mt-6 text-sm text-steel">
            {s.payment.orderNumber}:{" "}
            <span className="font-mono text-lg font-bold text-ink select-all" dir="ltr" data-testid="order-number">
              {result.number}
            </span>
          </p>
        ) : null}
      </div>
      {canRetry ? (
        <form onSubmit={retry} className="rounded-[var(--radius-lg)] border border-line bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold text-ink">{s.payment.retryTitle}</h2>
          {error ? (
            <p role="alert" className="mb-4 rounded-[var(--radius-md)] border border-signal/30 bg-signal-50 px-4 py-3 text-sm text-signal-ink">
              {error}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <TextField className="flex-1" label={s.payment.retryEmail} name="email" type="email" autoComplete="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" size="lg" disabled={busy || !email} icon={busy ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <CreditCard aria-hidden="true" className="size-5" />}>
              {busy ? s.payment.retrying : s.payment.retry}
            </Button>
          </div>
        </form>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        <ButtonLink href={hrefs.status} variant="outline" icon={<PackageSearch aria-hidden="true" className="size-5" />}>
          {s.success.track}
        </ButtonLink>
        {!ok && !review ? (
          <ButtonLink href={hrefs.notice} variant="outline" icon={<ReceiptText aria-hidden="true" className="size-5" />}>
            {s.success.notify}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
