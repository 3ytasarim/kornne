import type { Locale } from "@prisma/client";
import { ActionForm, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { CONTENT_NAV } from "@/components/admin/subnavs";
import { Card, ModuleState, SubNav, Tabs } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALE_META, LOCALES } from "@/lib/i18n/config";
import { saveFaqAction } from "../actions";

export const metadata = { title: "SSS" };
const STATE: Record<string, [string, "success" | "warning" | "neutral" | "outline"]> = { PUBLISHED: ["Yayında", "success"], REVIEW: ["Onay bekliyor", "warning"], DRAFT: ["Taslak", "neutral"], ARCHIVED: ["Arşiv", "outline"] };

function StateSelect({ canPublish, value }: { canPublish: boolean; value: string }) {
  return (
    <Select name="state" label="Durum" defaultValue={value}>
      <option value="DRAFT">Taslak</option>
      <option value="REVIEW">Yayın onayına gönder</option>
      {canPublish ? <option value="PUBLISHED">Yayında</option> : null}
      <option value="ARCHIVED">Arşiv</option>
    </Select>
  );
}

/** Site FAQ + product Q&A (GEO). Only answers with a stated source can be published. */
export default async function FaqPage({ searchParams }: PageProps<"/admin/content/faq">) {
  const user = await requireAdmin("content");
  const sp = await searchParams;
  const locale = (LOCALES.includes(sp.dil as Locale) ? sp.dil : "tr") as Locale;
  const db = requireDb();
  const [items, products] = await Promise.all([
    db.faqItem.findMany({ where: { locale }, orderBy: [{ productId: "asc" }, { sortOrder: "asc" }] }),
    db.product.findMany({ where: { status: "PUBLISHED", needsReview: false }, orderBy: { sortOrder: "asc" }, select: { id: true, translations: { where: { locale: "tr" }, select: { title: true } } } }),
  ]);
  const canEdit = allowed(user.role, "faq.edit");
  const canPublish = allowed(user.role, "content.publish");
  const title = (pid: string | null) => (pid ? (products.find((p) => p.id === pid)?.translations[0]?.title ?? "ürün") : "Genel SSS");
  const productSelect = (value: string) => (
    <Select name="productId" label="Nerede gösterilsin?" defaultValue={value}>
      <option value="">Genel SSS sayfası</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          Ürün: {p.translations[0]?.title}
        </option>
      ))}
    </Select>
  );
  return (
    <>
      <PageHeader title="SSS ve ürün soru-cevap" description="Yalnız gerçek, kaynağı belli cevaplar yayınlanır (GEO: AI asistanlarının alıntılayacağı içerik doğru olmalı). Yayındaki genel SSS varsa menüde “SSS” bağlantısı ve FAQPage verisi otomatik çıkar." actions={<ModuleState state="live" />} />
      <SubNav items={CONTENT_NAV} current="/admin/content/faq" />
      <Tabs label="Dil" current={locale} items={LOCALES.map((l) => ({ key: l, label: LOCALE_META[l].nativeName, href: `/admin/content/faq?dil=${l}` }))} />
      {items.length === 0 ? <Notice className="mb-6">Bu dilde soru-cevap yok. Kaynakta doğrulanmış SSS içeriği bulunmadığı için hazır içerik eklenmedi.</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        {items.map((f) => (
          <Card key={f.id} title={f.question} description={`${title(f.productId)} · ${fmtDateTime(f.updatedAt)}`} actions={<Badge tone={STATE[f.state]![1]}>{STATE[f.state]![0]}</Badge>}>
            <ActionForm action={saveFaqAction} className="space-y-3" aria-label={`Soru: ${f.question}`}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="locale" value={locale} />
              <div lang={locale} dir={dirOf(locale)} className="space-y-3">
                <Input name="question" label="Soru" defaultValue={f.question} required />
                <RichTextEditor name="answerHtml" label="Cevap" defaultValue={f.answerHtml} minHeight="8rem" />
              </div>
              <Input name="source" label="Cevabın kaynağı (yayın için zorunlu)" defaultValue={f.source ?? ""} />
              <div className="grid gap-3 sm:grid-cols-3">
                {productSelect(f.productId ?? "")}
                <Input name="sortOrder" type="number" label="Sıra" defaultValue={String(f.sortOrder)} />
                <StateSelect canPublish={canPublish} value={f.state} />
              </div>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton size="sm">Kaydet</SubmitButton>
                  <FormMessage />
                </div>
              ) : null}
            </ActionForm>
          </Card>
        ))}
        {canEdit ? (
          <Card title="Yeni soru-cevap" className="border-dashed">
            <ActionForm action={saveFaqAction} className="space-y-3" aria-label="Yeni soru" resetOnOk>
              <input type="hidden" name="locale" value={locale} />
              <div lang={locale} dir={dirOf(locale)} className="space-y-3">
                <Input name="question" label="Soru" required />
                <RichTextEditor name="answerHtml" label="Cevap" minHeight="8rem" />
              </div>
              <Input name="source" label="Cevabın kaynağı" placeholder="Teknik föy / firma beyanı, tarih" />
              <div className="grid gap-3 sm:grid-cols-3">
                {productSelect("")}
                <Input name="sortOrder" type="number" label="Sıra" defaultValue="0" />
                <StateSelect canPublish={canPublish} value="DRAFT" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton size="sm">Ekle</SubmitButton>
                <FormMessage />
              </div>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
