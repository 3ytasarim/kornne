import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { sanitizeRichText } from "@/lib/catalog/sanitize";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALES, type Locale } from "@/lib/i18n/config";

export const metadata = { title: "İçerik önizleme", robots: { index: false, follow: false } };

/** Admin-only preview of the working copy (or of a specific revision). Same typography as the storefront. */
export default async function ContentPreview({ params, searchParams }: PageProps<"/admin/content/[id]/preview">) {
  await requireAdmin("content");
  const { id } = await params;
  const sp = await searchParams;
  const locale = (LOCALES.includes(sp.dil as Locale) ? sp.dil : "tr") as Locale;
  const t = await requireDb().pageTranslation.findUnique({ where: { pageId_locale: { pageId: id, locale } }, include: { revisions: { where: typeof sp.surum === "string" ? { id: sp.surum } : undefined, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!t) notFound();
  const rev = typeof sp.surum === "string" ? t.revisions[0] : null;
  if (typeof sp.surum === "string" && !rev) notFound();
  const v = rev ?? t;
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/admin/content/${id}?dil=${locale}`} className="text-brand-700 hover:underline dark:text-brand-300">
          ← Düzenlemeye dön
        </Link>
      </p>
      <Notice tone="warning" className="mb-4">
        Önizleme — {rev ? `sürüm ${fmtDateTime(rev.createdAt)}` : "çalışma kopyası"}. {t.state === "PUBLISHED" && t.publishedRevisionId !== rev?.id ? "Vitrinde yayındaki sürüm farklı olabilir." : ""} Bu sayfa herkese açık değildir.
      </Notice>
      <article lang={locale} dir={dirOf(locale)} className="mx-auto max-w-4xl rounded-[var(--radius-lg)] border border-line bg-bg p-6 sm:p-10">
        <h1 className="font-display text-h1 font-bold text-ink">{v.title}</h1>
        {v.excerpt ? <p className="mt-3 text-lg text-steel">{v.excerpt}</p> : null}
        {v.bodyHtml.trim() ? <div className="rich mt-8" dangerouslySetInnerHTML={{ __html: sanitizeRichText(v.bodyHtml) }} /> : <p className="mt-8 text-steel">Bu dilde metin yok — vitrin Türkçe metni “çeviri yok” uyarısıyla gösterir.</p>}
      </article>
    </>
  );
}
