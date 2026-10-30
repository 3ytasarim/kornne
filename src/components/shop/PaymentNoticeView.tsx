"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { paymentNoticeAction } from "@/app/[locale]/odeme/actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextArea, TextField } from "@/components/ui/Field";
import type { Dictionary } from "@/lib/i18n/dictionaries";

type Shop = Dictionary["shop"];

/**
 * Legacy /odeme-bildirimi. The customer only NOTIFIES a transfer (order no + e-mail + payer + bank + amount + date);
 * an admin confirms it against the bank statement. No receipt upload (no personal documents stored).
 */
export function PaymentNoticeView({ s, banks, statusHref, today }: { s: Shop; banks: { id: string; name: string }[]; statusHref: string; today: string }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const err = (k: string) => (errors[k] ? ((s.errors as Record<string, string>)[errors[k]!] ?? s.errors.invalid) : undefined);

  if (done) {
    return (
      <div role="status" className="rounded-[var(--radius-xl)] border border-success/30 bg-success-50 p-8 text-center" data-testid="notice-success">
        <CheckCircle2 aria-hidden="true" className="mx-auto size-10 text-success" />
        <h2 className="mt-3 text-h3 font-bold text-ink">{s.notice.successTitle}</h2>
        <p className="mt-2 text-ink-2">{s.notice.successText}</p>
        <ButtonLink href={statusHref} variant="outline" className="mt-6 bg-surface">
          {s.success.track}
        </ButtonLink>
      </div>
    );
  }
  if (!banks.length) return <p className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-6 text-ink-2">{s.notice.noBanks}</p>;

  return (
    <form
      noValidate
      data-notice-form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const str = (k: string) => String(fd.get(k) ?? "");
        setFormError(null);
        start(async () => {
          const r = await paymentNoticeAction({ number: str("number"), email: str("email"), payerName: str("payerName"), bankAccountId: str("bankAccountId"), amount: str("amount"), paidAt: str("paidAt"), note: str("note"), website: str("website") }).catch(() => ({ ok: false as const, code: "error" }));
          if (r.ok) return setDone(true);
          if ("fields" in r && r.fields) return setErrors(r.fields);
          setErrors({});
          setFormError(r.code === "not_found" ? s.errors.notFound : r.code === "state" ? s.errors.state : r.code === "rate" ? s.errors.rate : s.errors.generic);
        });
      }}
      className="space-y-5 rounded-[var(--radius-xl)] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8"
    >
      {formError ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-signal/30 bg-signal-50 px-4 py-3 text-sm text-signal-ink">
          {formError}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label={s.status.number} name="number" placeholder={s.status.numberHint} dir="ltr" autoCapitalize="characters" required maxLength={24} error={err("number")} />
        <TextField label={s.status.email} name="email" type="email" autoComplete="email" dir="ltr" required maxLength={160} error={err("email")} />
        <TextField className="sm:col-span-2" label={s.notice.payerName} name="payerName" autoComplete="organization" required maxLength={160} error={err("payerName")} />
        <SelectField label={s.notice.bank} name="bankAccountId" required defaultValue="" error={err("bankAccountId")}>
          <option value="" disabled>
            {s.notice.chooseBank}
          </option>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <TextField label={s.notice.amount} name="amount" inputMode="decimal" dir="ltr" placeholder="12.345,67" required maxLength={20} error={err("amount")} />
        <TextField label={s.notice.paidAt} name="paidAt" type="date" max={today} defaultValue={today} required error={err("paidAt")} />
        <TextArea className="sm:col-span-2" label={s.notice.note} name="note" maxLength={500} rows={3} />
      </div>
      <div aria-hidden="true" className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="notice-website">Website</label>
        <input id="notice-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto" icon={pending ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}>
        {pending ? s.notice.sending : s.notice.send}
      </Button>
    </form>
  );
}
