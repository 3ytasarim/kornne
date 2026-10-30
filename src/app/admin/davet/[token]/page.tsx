import Image from "next/image";
import { notFound } from "next/navigation";
import { requireDb } from "@/lib/db";
import { findOpenInvite } from "@/lib/admin/users";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const metadata = { title: "Şifre belirle", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** One-time invitation / password reset page. Unknown, used or expired tokens → 404 (no account enumeration). */
export default async function InvitePage({ params }: PageProps<"/admin/davet/[token]">) {
  const { token } = await params;
  const inv = await findOpenInvite(requireDb(), token);
  if (!inv) notFound();
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-surface-2 px-4 py-12">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-line bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex rounded-full bg-white p-1 ring-1 ring-line">
            <Image src="/brand/kornne-logo.png" alt="" width={40} height={40} className="size-10" />
          </span>
          <span className="font-display text-xl font-bold tracking-[0.2em] text-brand-700 dark:text-brand-300">KORNNE</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">{inv.kind === "INVITE" ? "Hesabınızı etkinleştirin" : "Yeni şifre belirleyin"}</h1>
        <p className="mt-1 mb-6 text-sm text-steel">{inv.user.email}</p>
        <AcceptInviteForm token={token} />
      </div>
    </main>
  );
}
