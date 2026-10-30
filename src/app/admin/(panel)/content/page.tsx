import Link from "next/link";
import type { ContentState, PageKind, Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { CONTENT_NAV } from "@/components/admin/subnavs";
import { FilterBar, FilterSelect, ModuleState, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { fmtDateTime, strParam } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { RowActions } from "@/components/admin/RowActions";
import { pageArchiveAction } from "../row-actions";
import { LOCALES } from "@/lib/i18n/config";

export const metadata = { title: "İçerik" };
const KIND: Record<string, string> = { CORPORATE: "Kurumsal", LEGAL: "Yasal metin", INFO: "Bilgi sayfası", LANDING: "Kampanya", BLOG: "Blog / haber" };
const STATE_TONE: Record<string, "success" | "warning" | "neutral" | "outline"> = { PUBLISHED: "success", REVIEW: "warning", DRAFT: "neutral", ARCHIVED: "outline" };
const STATE_LABEL_SHORT: Record<string, string> = { PUBLISHED: "Yayında", REVIEW: "Onayda", DRAFT: "Taslak", ARCHIVED: "Arşiv" };

export default async function ContentPage({ searchParams }: PageProps<"/admin/content">) {
  const user = await requireAdmin("content");
  const sp = await searchParams;
  const kind = strParam(sp.tur);
  const state = strParam(sp.durum);
  const where: Prisma.PageWhereInput = {};
  if (kind in KIND) where.kind = kind as PageKind;
  if (["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"].includes(state)) where.translations = { some: { state: state as ContentState } };
  const pages = await requireDb().page.findMany({ where, orderBy: [{ kind: "asc" }, { key: "asc" }], include: { translations: { select: { locale: true, state: true, title: true, updatedAt: true, publishedRevisionId: true } } } });
  return (
    <>
      <PageHeader
        title="İçerik yönetimi"
        description="Kurumsal sayfalar, yasal metinler ve blog. Her kayıt sürüm geçmişiyle saklanır; yayındaki sürüm, yeni sürüm yayınlanana kadar değişmez."
        actions={
          <div className="flex items-center gap-2">
            <ModuleState state="live" />
            {allowed(user.role, "content.edit") ? (
              <Link href="/admin/content/new" className={buttonClass("primary", "md")}>
                <Plus aria-hidden="true" className="size-4" /> Yeni içerik
              </Link>
            ) : null}
          </div>
        }
      />
      <SubNav items={CONTENT_NAV} current="/admin/content" />
      <FilterBar action="/admin/content" resetHref="/admin/content" label="İçerik filtreleri">
        <FilterSelect name="tur" label="Tür" value={kind} options={[["", "Tümü"], ...Object.entries(KIND)]} />
        <FilterSelect name="durum" label="Durum (herhangi bir dilde)" value={state} options={[["", "Tümü"], ["PUBLISHED", "Yayında"], ["REVIEW", "Onay bekliyor"], ["DRAFT", "Taslak"], ["ARCHIVED", "Arşiv"]]} />
      </FilterBar>
      <DataTable
        caption="İçerikler"
        rows={pages}
        rowKey={(p) => p.id}
        empty="İçerik yok."
        columns={[
          { key: "t", header: "Başlık", cell: (p) => <Link href={`/admin/content/${p.id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{p.translations.find((t) => t.locale === "tr")?.title ?? p.translations[0]?.title ?? p.key}</Link> },
          { key: "k", header: "Tür", cell: (p) => KIND[p.kind] ?? p.kind },
          {
            key: "l",
            header: "Diller",
            cell: (p) => (
              <div className="flex flex-wrap gap-1">
                {LOCALES.map((l) => {
                  const t = p.translations.find((x) => x.locale === l);
                  return t ? (
                    <Badge key={l} tone={STATE_TONE[t.state]}>
                      {l.toUpperCase()} {STATE_LABEL_SHORT[t.state]}
                    </Badge>
                  ) : null;
                })}
              </div>
            ),
          },
          { key: "a", header: "Yasal onay", cell: (p) => (p.kind === "LEGAL" ? (p.legalApprovedAt ? <Badge tone="success">Onaylı</Badge> : <Badge tone="warning">Onaysız</Badge>) : "—") },
          { key: "u", header: "Güncelleme", cell: (p) => fmtDateTime(p.translations.map((t) => t.updatedAt).sort((a, b) => +b - +a)[0]) },
          {
            key: "x",
            header: "İşlemler",
            align: "end",
            // content keeps its revision history: "Arşivle" hides it everywhere instead of deleting
            cell: (p) => <RowActions id={p.id} editHref={`/admin/content/${p.id}`} toggle={allowed(user.role, "content.publish") ? { action: pageArchiveAction, active: p.status !== "ARCHIVED", labels: ["Arşivle", "Arşivden çıkar"] } : undefined} />,
          },
        ]}
      />
    </>
  );
}
