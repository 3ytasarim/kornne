import { ActionForm, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { CONTENT_NAV } from "@/components/admin/subnavs";
import { Card, ModuleState, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { fmtDateTime, isoLocal } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALE_META, LOCALES } from "@/lib/i18n/config";
import { saveBannerAction } from "../actions";

export const metadata = { title: "Duyuru / banner" };
type B = { id?: string; placement: string; state: string; startsAt: Date | null; endsAt: Date | null; linkPath: string | null; sortOrder: number; translations: { locale: string; title: string; text: string | null; ctaLabel: string | null }[] };

function BannerForm({ b, canEdit, canPublish }: { b: B; canEdit: boolean; canPublish: boolean }) {
  const now = new Date();
  const live = b.state === "PUBLISHED" && (!b.startsAt || b.startsAt <= now) && !!b.endsAt && b.endsAt > now;
  return (
    <Card title={b.translations.find((t) => t.locale === "tr")?.title || "Yeni duyuru"} description={b.id ? `${b.placement === "TOPBAR" ? "Üst şerit" : "Ana sayfa şeridi"} · ${fmtDateTime(b.startsAt)} → ${fmtDateTime(b.endsAt)}` : "Yayınlanacak duyurunun bitiş tarihi zorunludur."} actions={b.id ? (live ? <Badge tone="success">Şu an yayında</Badge> : b.state === "PUBLISHED" ? <Badge tone="outline">Tarih aralığı dışında</Badge> : <Badge tone="neutral">{b.state}</Badge>) : null} className={b.id ? "" : "border-dashed"}>
      <ActionForm action={saveBannerAction} className="space-y-4" aria-label="Duyuru" resetOnOk={!b.id}>
        {b.id ? <input type="hidden" name="id" value={b.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select name="placement" label="Yer" defaultValue={b.placement}>
            <option value="HOME_STRIP">Ana sayfa şeridi</option>
            <option value="TOPBAR">Üst şerit (tüm sayfalar)</option>
          </Select>
          <Select name="state" label="Durum" defaultValue={b.state}>
            <option value="DRAFT">Taslak</option>
            <option value="REVIEW">Yayın onayına gönder</option>
            {canPublish ? <option value="PUBLISHED">Yayında (tarih aralığında)</option> : null}
            <option value="ARCHIVED">Arşiv</option>
          </Select>
          <Input name="startsAt" type="datetime-local" label="Başlangıç (İstanbul)" defaultValue={isoLocal(b.startsAt)} />
          <Input name="endsAt" type="datetime-local" label="Bitiş (İstanbul)" defaultValue={isoLocal(b.endsAt)} />
          <Input name="linkPath" label="Bağlantı" defaultValue={b.linkPath ?? ""} placeholder="/kategori/kurban-ekipmanlari" />
          <Input name="sortOrder" type="number" label="Sıra" defaultValue={String(b.sortOrder)} />
        </div>
        <details className="rounded-[var(--radius-md)] border border-line p-3" open={!b.id}>
          <summary className="cursor-pointer text-sm font-semibold">Metinler (dil yoksa o dilde gösterilmez)</summary>
          <div className="mt-3 space-y-4">
            {LOCALES.map((l) => {
              const t = b.translations.find((x) => x.locale === l);
              return (
                <fieldset key={l} className="grid gap-3 sm:grid-cols-3" lang={l} dir={dirOf(l)}>
                  <legend className="mb-1 text-xs font-semibold text-steel">{LOCALE_META[l].nativeName}</legend>
                  <Input name={`t.${l}.title`} label="Başlık" defaultValue={t?.title ?? ""} required={l === "tr"} />
                  <Input name={`t.${l}.text`} label="Metin" defaultValue={t?.text ?? ""} />
                  <Input name={`t.${l}.cta`} label="Düğme" defaultValue={t?.ctaLabel ?? ""} />
                </fieldset>
              );
            })}
          </div>
        </details>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size="sm">{b.id ? "Kaydet" : "Oluştur"}</SubmitButton>
            <FormMessage />
          </div>
        ) : null}
      </ActionForm>
    </Card>
  );
}

/** Time-boxed announcements. A campaign can never stay online forever (end date required to publish). */
export default async function BannersPage() {
  const user = await requireAdmin("content");
  const banners = await requireDb().banner.findMany({ orderBy: [{ state: "asc" }, { sortOrder: "asc" }], include: { translations: true } });
  const canEdit = allowed(user.role, "banner.edit");
  const canPublish = allowed(user.role, "content.publish");
  return (
    <>
      <PageHeader title="Duyuru / banner" description="Ana sayfa şeridi ve üst şerit. Yayında görünmesi için durum “Yayında” ve şu anki zaman başlangıç–bitiş aralığında olmalı." actions={<ModuleState state="live" />} />
      <SubNav items={CONTENT_NAV} current="/admin/content/banners" />
      <Notice className="mb-6">Fiyat veya indirim içeren kampanya duyurusu yalnız doğrulanmış fiyatla yapılır. Eski sitedeki süresi geçmiş kampanyalar aktarılmadı.</Notice>
      <div className="grid gap-6 xl:grid-cols-2">
        {banners.map((b) => (
          <BannerForm key={b.id} b={b} canEdit={canEdit} canPublish={canPublish} />
        ))}
        {canEdit ? <BannerForm b={{ placement: "HOME_STRIP", state: "DRAFT", startsAt: null, endsAt: null, linkPath: null, sortOrder: 0, translations: [] }} canEdit={canEdit} canPublish={canPublish} /> : null}
      </div>
    </>
  );
}
