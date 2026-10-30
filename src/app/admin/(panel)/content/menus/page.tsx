import { ActionForm, Check, ConfirmSubmit, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { CONTENT_NAV } from "@/components/admin/subnavs";
import { Card, ModuleState, SubNav } from "@/components/admin/ui";
import { Notice } from "@/components/ui/States";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALE_META, LOCALES } from "@/lib/i18n/config";
import { deleteMenuAction, saveMenuAction } from "../actions";

export const metadata = { title: "Menü ve footer" };
const LOCATIONS = [
  ["HEADER", "Üst menü (Ürünler'den sonra)"],
  ["FOOTER_CORPORATE", "Footer — kurumsal"],
  ["FOOTER_LEGAL", "Footer — yasal"],
] as const;
type M = { id?: string; location: string; kind: string; pageKey: string | null; categoryKey: string | null; path: string | null; labels: unknown; sortOrder: number; active: boolean };

/** Header / footer links. Links to unpublished pages are hidden automatically on the storefront (no broken links). */
export default async function MenusPage() {
  const user = await requireAdmin("content");
  const db = requireDb();
  const [items, pages, categories] = await Promise.all([
    db.menuItem.findMany({ orderBy: [{ location: "asc" }, { sortOrder: "asc" }] }),
    db.page.findMany({ select: { key: true, translations: { select: { locale: true, title: true, state: true } } }, orderBy: { key: "asc" } }),
    db.category.findMany({ select: { key: true, translations: { where: { locale: "tr" }, select: { name: true } } }, orderBy: { sortOrder: "asc" } }),
  ]);
  const canEdit = allowed(user.role, "menu.edit");
  const form = (m: M) => {
    const labels = (m.labels ?? {}) as Record<string, string>;
    return (
      <ActionForm action={saveMenuAction} className="space-y-3" aria-label="Menü öğesi" resetOnOk={!m.id}>
        {m.id ? <input type="hidden" name="id" value={m.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Select name="location" label="Konum" defaultValue={m.location}>
            {LOCATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select name="kind" label="Hedef türü" defaultValue={m.kind}>
            <option value="page">İçerik sayfası</option>
            <option value="category">Kategori</option>
            <option value="path">Adres</option>
          </Select>
          <Input name="sortOrder" type="number" label="Sıra" defaultValue={String(m.sortOrder)} />
          <Select name="pageKey" label="Sayfa (tür: içerik)" defaultValue={m.pageKey ?? ""}>
            <option value="">—</option>
            {pages.map((p) => (
              <option key={p.key} value={p.key}>
                {p.translations.find((t) => t.locale === "tr")?.title ?? p.key} ({p.translations.filter((t) => t.state === "PUBLISHED").map((t) => t.locale.toUpperCase()).join(",") || "yayında değil"})
              </option>
            ))}
          </Select>
          <Select name="categoryKey" label="Kategori (tür: kategori)" defaultValue={m.categoryKey ?? ""}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.translations[0]?.name ?? c.key}
              </option>
            ))}
          </Select>
          <Input name="path" label="Adres (tür: adres)" defaultValue={m.path ?? ""} placeholder="/iletisim veya https://…" />
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {LOCALES.map((l) => (
            <div key={l} lang={l} dir={dirOf(l)}>
              <Input name={`label.${l}`} label={`Etiket ${l.toUpperCase()}`} defaultValue={labels[l] ?? ""} required={l === "tr"} />
            </div>
          ))}
        </div>
        <Check name="active" label="Aktif" defaultChecked={m.active} />
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton size="sm">{m.id ? "Kaydet" : "Ekle"}</SubmitButton>
            <FormMessage />
          </div>
        ) : null}
      </ActionForm>
    );
  };
  return (
    <>
      <PageHeader title="Menü ve footer" description="Etiketi olmayan dilde Türkçe etiket kullanılır. Sayfa bir dilde yayında değilse o dilde bağlantı gösterilmez (yalnız Türkçe yasal metinler Türkçe sayfaya bağlanır)." actions={<ModuleState state="live" />} />
      <SubNav items={CONTENT_NAV} current="/admin/content/menus" />
      <Notice className="mb-6">Ürün kategorileri menüsü (mega menü) kategorilerden otomatik oluşur. “/blog” ve “/sss” bağlantıları yalnız o dilde yayında içerik varsa görünür.</Notice>
      {LOCATIONS.map(([loc, label]) => (
        <Card key={loc} title={label} className="mb-6">
          <ul className="space-y-4">
            {items
              .filter((i) => i.location === loc)
              .map((i) => (
                <li key={i.id} className="rounded-[var(--radius-md)] border border-line p-4">
                  {form(i)}
                  {canEdit ? (
                    <ActionForm action={deleteMenuAction} className="mt-2 flex items-center gap-2">
                      <input type="hidden" name="id" value={i.id} />
                      <ConfirmSubmit>Menüden kaldır</ConfirmSubmit>
                      <FormMessage />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
          </ul>
          {items.every((i) => i.location !== loc) ? <p className="text-sm text-steel">Öğe yok.</p> : null}
        </Card>
      ))}
      {canEdit ? (
        <Card title="Yeni menü öğesi" className="border-dashed">
          {form({ location: "FOOTER_CORPORATE", kind: "page", pageKey: null, categoryKey: null, path: null, labels: {}, sortOrder: 50, active: true })}
        </Card>
      ) : null}
      <p className="mt-4 text-xs text-steel">Diller: {LOCALES.map((l) => LOCALE_META[l].nativeName).join(", ")}</p>
    </>
  );
}
