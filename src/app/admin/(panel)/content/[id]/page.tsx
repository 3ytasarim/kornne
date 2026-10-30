import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { ActionForm, Area, ConfirmSubmit, FormMessage, Input, LengthHint, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Card, KeyValues, Tabs } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALE_META, LOCALES, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { archivePageAction, legalApprovalAction, publishPageAction, restoreRevisionAction, savePageAction, submitReviewAction, unpublishPageAction } from "../actions";

export const metadata = { title: "İçerik düzenle" };
const STATE: Record<string, [string, "success" | "warning" | "neutral" | "outline"]> = { PUBLISHED: ["Yayında", "success"], REVIEW: ["Yayın onayı bekliyor", "warning"], DRAFT: ["Taslak", "neutral"], ARCHIVED: ["Arşiv", "outline"] };

export default async function ContentEdit({ params, searchParams }: PageProps<"/admin/content/[id]">) {
  const user = await requireAdmin("content");
  const { id } = await params;
  const sp = await searchParams;
  const locale = (LOCALES.includes(sp.dil as Locale) ? sp.dil : "tr") as Locale;
  const db = requireDb();
  const page = await db.page.findUnique({ where: { id }, include: { translations: { include: { revisions: { orderBy: { createdAt: "desc" }, take: 15 } } } } });
  if (!page) notFound();
  const t = page.translations.find((x) => x.locale === locale);
  const canEdit = allowed(user.role, "content.edit");
  const canPublish = allowed(user.role, "content.publish");
  const latest = t?.revisions[0];
  const dirty = !!t && !!latest && latest.id !== t.publishedRevisionId;
  const section = page.kind === "BLOG" ? "blog" : "sayfa";
  const authors = await db.user.findMany({ where: { id: { in: [...new Set((t?.revisions ?? []).map((r) => r.authorId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
  const tr = page.translations.find((x) => x.locale === "tr");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/content" className="text-brand-700 hover:underline dark:text-brand-300">
          ← İçerik
        </Link>
      </p>
      <PageHeader
        title={tr?.title ?? t?.title ?? page.key}
        description={`${page.kind} · anahtar ${page.key}${page.kind === "LEGAL" ? (page.legalApprovedAt ? ` · hukuken onaylandı ${fmtDateTime(page.legalApprovedAt)}` : " · hukuki onay YOK") : ""}`}
        actions={
          canPublish ? (
            <ActionForm action={archivePageAction} className="flex items-center gap-2">
              <input type="hidden" name="pageId" value={page.id} />
              <input type="hidden" name="archived" value={page.status === "ARCHIVED" ? "false" : "true"} />
              {page.status === "ARCHIVED" ? <SubmitButton size="sm" variant="secondary">Arşivden çıkar</SubmitButton> : <ConfirmSubmit>Arşivle</ConfirmSubmit>}
              <FormMessage />
            </ActionForm>
          ) : null
        }
      />
      <Tabs
        label="Dil sürümleri"
        current={locale}
        items={LOCALES.map((l) => {
          const x = page.translations.find((y) => y.locale === l);
          return { key: l, href: `/admin/content/${page.id}?dil=${l}`, label: <span className="flex items-center gap-1.5">{LOCALE_META[l].nativeName}{x ? <Badge tone={STATE[x.state]![1]}>{STATE[x.state]![0]}</Badge> : <Badge tone="outline">yok</Badge>}</span> };
        })}
      />
      {page.kind === "LEGAL" && !page.legalApprovedAt ? <Notice tone="warning" className="mb-6">Bu yasal metin hukuken onaylanmadı. Yayınlansa bile vitrinde “onaylı” ibaresi yoktur; noindex kalır.</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card title={`${LOCALE_META[locale].nativeName} — çalışma kopyası`} description={t ? (dirty && t.state === "PUBLISHED" ? "Yayınlanmamış değişiklikler var: vitrin hâlâ önceki yayın sürümünü gösteriyor." : "Kaydet → önizle → yayınla.") : "Bu dilde sürüm yok. Doldurup kaydedince taslak olarak oluşur."}>
          {page.status === "ARCHIVED" ? <Notice tone="warning">Arşivdeki içerik düzenlenemez.</Notice> : null}
          <ActionForm action={savePageAction} className="space-y-5" aria-label="İçerik düzenle">
            <input type="hidden" name="pageId" value={page.id} />
            <input type="hidden" name="locale" value={locale} />
            {t ? <input type="hidden" name="expectedUpdatedAt" value={t.updatedAt.toISOString()} /> : null}
            <div lang={locale} dir={dirOf(locale)} className="space-y-5">
              <Input name="title" label="Başlık" defaultValue={t?.title ?? ""} required />
              <Input name="slug" label="Adres (slug)" defaultValue={t?.slug ?? ""} required dir="ltr" hint={`Yayın adresi: ${localizePath(locale, `/${section}/${t?.slug ?? "…"}`)}`} />
              {page.kind === "BLOG" ? <Area name="excerpt" label="Özet" defaultValue={t?.excerpt ?? ""} rows={2} hint="Liste sayfasında görünür." /> : null}
              <RichTextEditor name="bodyHtml" label="Metin" defaultValue={t?.bodyHtml ?? ""} hint={locale !== "tr" ? "Bu dilde metin yoksa boş bırakın: vitrin Türkçe metni “çeviri yok” uyarısıyla gösterir (sayfa indekslenmez)." : "Kaydederken HTML güvenlik filtresinden geçer."} minHeight="20rem" />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Input id="cms-seo-t" name="seoTitle" label="SEO başlığı" defaultValue={t?.seoTitle ?? ""} />
                  <LengthHint forId="cms-seo-t" min={30} max={60} />
                </div>
                <div className="space-y-1">
                  <Area id="cms-seo-d" name="seoDescription" label="SEO açıklaması" defaultValue={t?.seoDescription ?? ""} rows={3} />
                  <LengthHint forId="cms-seo-d" min={70} max={160} />
                </div>
              </div>
            </div>
            <Input name="note" label="Sürüm notu (isteğe bağlı)" placeholder="Ne değişti?" />
            {canEdit && page.status !== "ARCHIVED" ? (
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton pendingText="Kaydediliyor…">Taslağı kaydet</SubmitButton>
                <FormMessage />
              </div>
            ) : null}
          </ActionForm>
        </Card>

        <div className="space-y-6">
          <Card title="Yayın">
            {t ? (
              <div className="space-y-3">
                <KeyValues rows={[["Durum", <Badge key="s" tone={STATE[t.state]![1]}>{STATE[t.state]![0]}</Badge>], ["Yayın adresi", t.publishedSlug ? <a key="a" href={localizePath(locale, `/${section}/${t.publishedSlug}`)} target="_blank" rel="noopener" className="break-all text-brand-700 underline dark:text-brand-300">{localizePath(locale, `/${section}/${t.publishedSlug}`)}</a> : "—"], ["Yayın tarihi", fmtDateTime(t.publishedAt)], ["Son kayıt", fmtDateTime(t.updatedAt)]]} />
                <Link href={`/admin/content/${page.id}/preview?dil=${locale}`} className={buttonClass("secondary", "sm", "w-full")}>
                  <Eye aria-hidden="true" className="size-4" /> Taslağı önizle
                </Link>
                {canEdit && !canPublish && t.state !== "REVIEW" && page.status !== "ARCHIVED" ? (
                  <ActionForm action={submitReviewAction} className="space-y-2">
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <SubmitButton size="sm" className="w-full">
                      İncelemeye gönder
                    </SubmitButton>
                    <FormMessage />
                  </ActionForm>
                ) : null}
                {canPublish && page.status !== "ARCHIVED" && (t.state !== "PUBLISHED" || dirty) ? (
                  <ActionForm action={publishPageAction} className="space-y-2">
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <ConfirmSubmit variant="primary" size="md" className="w-full" confirmText="Son sürümü yayınla">
                      {t.state === "PUBLISHED" ? "Değişiklikleri yayınla" : "Yayınla"}
                    </ConfirmSubmit>
                    <FormMessage />
                  </ActionForm>
                ) : null}
                {canPublish && t.state === "PUBLISHED" ? (
                  <ActionForm action={unpublishPageAction} className="space-y-2">
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <ConfirmSubmit className="w-full">Yayından kaldır (taslağa al)</ConfirmSubmit>
                    <FormMessage />
                  </ActionForm>
                ) : null}
                {!canPublish ? <p className="text-xs text-steel">Yayınlama yetkiniz yok: içeriği incelemeye gönderin; Yönetici yayınlar.</p> : null}
              </div>
            ) : (
              <p className="text-sm text-steel">Önce bu dilde taslak kaydedin.</p>
            )}
          </Card>

          {page.kind === "LEGAL" && allowed(user.role, "settings.verify") ? (
            <Card title="Hukuki onay">
              <ActionForm action={legalApprovalAction} className="space-y-2">
                <input type="hidden" name="pageId" value={page.id} />
                <input type="hidden" name="approve" value={page.legalApprovedAt ? "false" : "true"} />
                {!page.legalApprovedAt ? <Input name="reference" label="Onay referansı" placeholder="Avukat/müşteri, tarih, yazışma" required /> : null}
                <SubmitButton size="sm" variant={page.legalApprovedAt ? "outline" : "primary"}>
                  {page.legalApprovedAt ? "Onayı kaldır" : "Hukuken onaylandı olarak işaretle"}
                </SubmitButton>
                <FormMessage />
              </ActionForm>
            </Card>
          ) : null}

          <Card title="Sürüm geçmişi" description="Her kayıt bir sürümdür. Geri yükleme çalışma kopyasına alır; yayın ayrı adımdır.">
            {!t?.revisions.length ? <p className="text-sm text-steel">Sürüm yok.</p> : null}
            <ol className="space-y-2">
              {t?.revisions.map((r) => (
                <li key={r.id} className="rounded-[var(--radius-md)] border border-line p-2.5 text-xs">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{fmtDateTime(r.createdAt)}</span>
                    {r.id === t.publishedRevisionId ? <Badge tone="success">yayındaki</Badge> : null}
                    {r.id === latest?.id ? <Badge tone="brand">son</Badge> : null}
                  </p>
                  <p className="text-steel">
                    {authors.find((a) => a.id === r.authorId)?.name ?? "—"}
                    {r.note ? ` · ${r.note}` : ""}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <Link href={`/admin/content/${page.id}/preview?dil=${locale}&surum=${r.id}`} className="text-brand-700 underline dark:text-brand-300">
                      Önizle
                    </Link>
                    {canEdit && r.id !== latest?.id ? (
                      <ActionForm action={restoreRevisionAction} className="inline-flex items-center gap-2">
                        <input type="hidden" name="revisionId" value={r.id} />
                        <ConfirmSubmit size="sm" confirmText="Geri yükle?">
                          Geri yükle
                        </ConfirmSubmit>
                        <FormMessage />
                      </ActionForm>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
