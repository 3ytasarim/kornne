import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Area, FormMessage, Input, LengthHint, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALE_META, LOCALES } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { saveCategoryAction } from "../../products/actions";

export const metadata = { title: "Kategori" };

export default async function CategoryEdit({ params }: PageProps<"/admin/categories/[id]">) {
  const user = await requireAdmin("products");
  const { id } = await params;
  const c = await requireDb().category.findUnique({ where: { id }, include: { translations: true } });
  if (!c) notFound();
  const canTr = allowed(user.role, "category.edit");
  const canOther = canTr || allowed(user.role, "translation.publish");
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/categories" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Kategoriler
        </Link>
      </p>
      <PageHeader title={c.translations.find((t) => t.locale === "tr")?.name ?? c.key} description={c.isAllProducts ? "Sanal “tüm ürünler” listesi — ürünler otomatik hesaplanır." : `Anahtar: ${c.key}`} />
      <div className="grid gap-6 xl:grid-cols-2">
        {LOCALES.map((l) => {
          const t = c.translations.find((x) => x.locale === l);
          return (
            <Card key={l} title={`${LOCALE_META[l].nativeName} (${l.toUpperCase()})`} actions={t ? <Badge tone={t.status === "LEGACY_SOURCE" || t.status === "APPROVED" ? "success" : "warning"}>{t.status}</Badge> : <Badge tone="outline">Yok</Badge>}>
              <ActionForm action={saveCategoryAction} className="space-y-4" aria-label={`Kategori ${l}`}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="locale" value={l} />
                <div lang={l} dir={dirOf(l)} className="space-y-4">
                  <Input name="name" label="Ad" defaultValue={t?.name ?? ""} required />
                  <Input name="slug" label="Adres (slug)" defaultValue={t?.slug ?? ""} required dir="ltr" hint={t ? localizePath(l, `/kategori/${t.slug}`) : undefined} />
                  <Area name="description" label="Açıklama" defaultValue={t?.description ?? ""} rows={3} />
                  <div className="space-y-1">
                    <Input id={`cs-${l}`} name="seoTitle" label="SEO başlığı" defaultValue={t?.seoTitle ?? ""} />
                    <LengthHint forId={`cs-${l}`} min={30} max={60} />
                  </div>
                  <div className="space-y-1">
                    <Area id={`cd-${l}`} name="seoDescription" label="SEO açıklaması" defaultValue={t?.seoDescription ?? ""} rows={2} />
                    <LengthHint forId={`cd-${l}`} min={70} max={160} />
                  </div>
                </div>
                {l === "tr" ? <Input name="sortOrder" type="number" label="Sıra" defaultValue={String(c.sortOrder)} /> : null}
                {(l === "tr" ? canTr : canOther) ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <SubmitButton size="sm">Kaydet</SubmitButton>
                    <FormMessage />
                  </div>
                ) : null}
              </ActionForm>
            </Card>
          );
        })}
      </div>
    </>
  );
}
