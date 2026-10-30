import type { Prisma } from "@prisma/client";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { FilterBar, FilterSearch, FilterSelect, ModuleState, Pagination } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDateTime, pageParam, strParam } from "@/lib/admin/format";
import { analyzeRedirects } from "@/lib/admin/redirect-check";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";

export const metadata = { title: "Yönlendirmeler" };
const PER_PAGE = 50;

/**
 * Redirects — READ-ONLY by design this sprint: the 125 legacy 301s are verified one-hop and protected. Slug changes
 * made in the product / category / content editors create their own 301s automatically (source SLUG_CHANGE).
 */
export default async function RedirectsPage({ searchParams }: PageProps<"/admin/redirects">) {
  await requireAdmin("redirects");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const src = strParam(sp.kaynak);
  const page = pageParam(sp.sayfa);
  const db = requireDb();
  const where: Prisma.RedirectWhereInput = {};
  if (q) where.OR = [{ fromPath: { contains: q, mode: "insensitive" } }, { toPath: { contains: q, mode: "insensitive" } }];
  if (src === "LEGACY_AUDIT" || src === "SLUG_CHANGE" || src === "ADMIN") where.source = src;
  const [rows, total, all, held] = await Promise.all([
    db.redirect.findMany({ where, orderBy: { fromPath: "asc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.redirect.count({ where }),
    db.redirect.findMany({ select: { fromPath: true, toPath: true, active: true, source: true } }),
    db.product.count({ where: { OR: [{ needsReview: true }, { status: { not: "PUBLISHED" } }] } }),
  ]);
  const issues = analyzeRedirects(all);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const params = new URLSearchParams(Object.entries({ q, kaynak: src }).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="Yönlendirmeler" description="Eski kornne.com adresleri tek adımda yeni sayfalara gider. Bu ekran salt okunurdur; adres değişiklikleri editörlerden otomatik yönlendirme üretir." actions={<ModuleState state="partial" title="Salt okunur + otomatik kontrol" />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam kayıt" value={all.length} />
        <StatCard label="Eski site (301)" value={all.filter((r) => r.source === "LEGACY_AUDIT").length} />
        <StatCard label="Adres değişikliği (301)" value={all.filter((r) => r.source === "SLUG_CHANGE").length} />
        <StatCard label="Döngü / zincir" value={issues.length} tone={issues.length ? "warning" : "success"} />
      </div>
      {issues.length ? (
        <Notice tone="warning" className="mb-6">
          {issues.map((i) => `${i.kind === "loop" ? "DÖNGÜ" : i.kind === "self" ? "KENDİNE" : "ZİNCİR"}: ${i.path.join(" → ")}`).join(" · ")}
        </Notice>
      ) : (
        <Notice className="mb-6">Döngü veya zincir yok: her eski adres tek adımda hedefe gidiyor. İncelemedeki/taslak {held} ürünün adresleri geçici (307) olarak kategorisine yönlenir (müşteri kararı olmadan 301’e çevrilmez).</Notice>
      )}
      <FilterBar action="/admin/redirects" resetHref="/admin/redirects" label="Yönlendirme filtreleri">
        <FilterSearch value={q} placeholder="/urun/… veya hedef" />
        <FilterSelect name="kaynak" label="Kaynak" value={src} options={[["", "Tümü"], ["LEGACY_AUDIT", "Eski site denetimi"], ["SLUG_CHANGE", "Adres değişikliği"], ["ADMIN", "Yönetici"]]} />
      </FilterBar>
      <DataTable
        caption="Yönlendirmeler"
        rows={rows}
        rowKey={(r) => r.id}
        empty="Kayıt yok"
        columns={[
          { key: "f", header: "Eski adres", cell: (r) => <code className="text-xs break-all">{r.fromPath}</code> },
          { key: "t", header: "Hedef", cell: (r) => <code className="text-xs break-all">{r.toPath}</code> },
          { key: "c", header: "Kod", cell: (r) => r.statusCode },
          { key: "s", header: "Kaynak", cell: (r) => <Badge tone="outline">{r.source}</Badge> },
          { key: "h", header: "İsabet", align: "end", cell: (r) => r.hits },
          { key: "d", header: "Kayıt", cell: (r) => fmtDateTime(r.createdAt) },
        ]}
      />
      <Pagination page={Math.min(page, pages)} pages={pages} total={total} href={(p) => `/admin/redirects?${new URLSearchParams([...params, ...(p > 1 ? [["sayfa", String(p)]] : [])])}`} />
    </>
  );
}
