import Image from "next/image";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { SITE } from "@/config/site";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Giriş" };
export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getSessionUser()) redirect("/admin");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(50rem_30rem_at_50%_-10%,rgb(41_62_89/0.25),transparent)] p-4">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-line bg-surface p-8 shadow-[var(--shadow-pop)]">
        <div className="mb-8 flex items-center gap-3">
          <Image src={SITE.logo.src} alt="" width={48} height={48} className="size-12" />
          <div>
            <p className="font-display text-lg font-bold tracking-[0.18em] text-brand-700 dark:text-brand-300">{SITE.name}</p>
            <h1 className="text-sm text-steel">Yönetim paneli girişi</h1>
          </div>
        </div>
        {!prisma ? (
          <p role="alert" className="mb-5 rounded-[var(--radius-md)] border border-warning/30 bg-warning-50 px-4 py-3 text-sm text-warning">
            Bu ortamda veritabanı yapılandırılmamış; giriş yapılamaz.
          </p>
        ) : null}
        <LoginForm />
        <p className="mt-6 flex items-center gap-2 text-xs text-steel">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Hatalı denemeler 15 dakika kilitlenir; tüm girişler kayıt altına alınır.
        </p>
      </div>
    </main>
  );
}
