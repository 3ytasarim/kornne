"use client";

import Link from "next/link";
import { ActionForm, FormMessage, Input, SubmitButton, useFormState } from "@/components/admin/forms";
import { acceptInviteAction } from "./actions";

function Done() {
  const s = useFormState();
  if (!s.ok) return null;
  return (
    <Link href="/admin/login" className="mt-4 inline-flex min-h-12 items-center font-semibold text-brand-700 underline">
      Giriş sayfasına git
    </Link>
  );
}

export function AcceptInviteForm({ token }: { token: string }) {
  return (
    <ActionForm action={acceptInviteAction} className="space-y-4" aria-label="Şifre belirle">
      <input type="hidden" name="token" value={token} />
      <Input name="password" type="password" label="Yeni şifre" autoComplete="new-password" required hint="En az 12 karakter, en az 6 farklı karakter." />
      <Input name="confirm" type="password" label="Yeni şifre (tekrar)" autoComplete="new-password" required />
      <SubmitButton className="w-full" pendingText="Kaydediliyor…">
        Şifreyi kaydet
      </SubmitButton>
      <FormMessage />
      <Done />
    </ActionForm>
  );
}
