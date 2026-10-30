"use client";

import { Check, Copy, Landmark } from "lucide-react";
import { useState } from "react";
import type { PublicBankAccount } from "@/lib/commerce/bank-accounts";
import { cn } from "@/lib/cn";

type Labels = { holder: string; branch: string; copyIban: string; copied: string };

/** Company bank accounts with one-tap IBAN copy (clipboard API; the IBAN stays selectable text as a fallback). */
export function BankAccountList({ accounts, labels, compact = false }: { accounts: PublicBankAccount[]; labels: Labels; compact?: boolean }) {
  return (
    <ul className={cn("grid grid-cols-1 gap-3", compact ? "" : "md:grid-cols-2")}>
      {accounts.map((a) => (
        <li key={a.id}>
          <BankCard account={a} labels={labels} />
        </li>
      ))}
    </ul>
  );
}

function BankCard({ account: a, labels }: { account: PublicBankAccount; labels: Labels }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(a.iban);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the IBAN text is still selectable */
    }
  };
  return (
    <div className="flex h-full flex-col gap-4 rounded-[var(--radius-lg)] border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-brand-50 text-brand-700 dark:text-brand-300">
          <Landmark className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-bold text-ink">{a.bankName}</p>
          <p className="truncate text-sm text-steel">
            {labels.holder}: {a.accountHolder}
            {a.branch ? ` · ${labels.branch}: ${a.branch}` : ""}
          </p>
        </div>
        <span className="ms-auto rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">{a.currency === "TRY" ? "TL" : a.currency}</span>
      </div>
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-surface-2 p-2 ps-3">
        <code className="min-w-0 flex-1 font-mono text-[0.9375rem] font-semibold tracking-wide break-all text-ink select-all" dir="ltr">
          {a.ibanFormatted}
        </code>
        <button type="button" onClick={copy} aria-label={`${labels.copyIban} — ${a.bankName}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-semibold text-ink shadow-sm ring-1 ring-line hover:ring-brand-600">
          {copied ? <Check aria-hidden="true" className="size-4 text-success" /> : <Copy aria-hidden="true" className="size-4" />}
          <span aria-live="polite">{copied ? labels.copied : "IBAN"}</span>
        </button>
      </div>
    </div>
  );
}
