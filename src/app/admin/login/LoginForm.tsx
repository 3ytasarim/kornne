"use client";

import { useActionState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-signal/30 bg-signal-50 px-4 py-3 text-sm text-signal">
          {state.error}
        </p>
      ) : null}
      <TextField label="E-posta" name="email" type="email" autoComplete="username" required defaultValue={state.email} dir="ltr" />
      <TextField label="Şifre" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      <Button type="submit" size="lg" disabled={pending} className="w-full" icon={pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <LogIn aria-hidden="true" className="size-4" />}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}
