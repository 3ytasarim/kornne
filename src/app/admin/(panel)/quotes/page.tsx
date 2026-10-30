import Link from "next/link";
import type { Prisma, QuoteStatus } from "@prisma/client";
import { Download } from "lucide-react";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { FilterBar, FilterSearch, FilterSelect, ModuleState, Pagination } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDate, fmtDateTime, istanbulDayStart, pageParam, strParam } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/quote/status-labels";
import { RowActions } from "@/components/admin/RowActions";

export const metadata = { title: "Teklif talepleri" };
export const dynamic = "force-dynamic";
const PER_PAGE = 25;
const STATUSES = ["NEW", "IN_REVIEW", "QUOTE_PREPARED", "RESPONDED", "CLOSED", "SPAM"] as const;

/**
 * Quote CRM inbox. The list shows NO personal data (reference, dates, status, products, assignee only) —
 * contact details are on the audited detail page.
 */
export default async function QuotesPage({ searchParams }: PageProps<"/admin/quotes">) {
  const user = await requireAdmin("quotes");
  const sp = await searchParams;
  const q = strParam(sp.q, 40).toUpperCase();
  const status = strParam(sp.durum);
  const assigned = strParam(sp.sorumlu);
  const source = strParam(sp.kaynak);
  const sort = strParam(sp.sirala) || "yeni";
  const page = pageParam(sp.sayfa);
  const db = requireDb();

  const where: Prisma.QuoteRequestWhereInput = { isTest: false };
  if (q) where.OR = [{ reference: { contains: q } }, { items: { some: { titleSnapshot: { contains: q, mode: "insensitive" } } } }];
  if ((STATUSES as readonly string[]).includes(status)) where.status = status as QuoteStatus;
  else if (status === "acik") where.status = { in: ["NEW", "IN_REVIEW", "QUOTE_PREPARED"] };
  if (assigned === "benim") where.assignedToId = user.id;
  else if (assigned === "atanmamis") where.assignedToId = null;
  else if (assigned) where.assignedToId = assigned;
  if (source === "QUOTE_LIST" || source === "PRODUCT_PAGE") where.source = source;
  const orderBy: Prisma.QuoteRequestOrderByWithRelationInput = sort === "eski" ? { createdAt: "asc" } : sort === "takip" ? { followUpAt: { sort: "asc", nulls: "last" } } : { createdAt: "desc" };

  const today = istanbulDayStart();
  const [rows, total, counts, todayCount, overdue, users] = await Promise.all([
    db.quoteRequest.findMany({ where, orderBy, skip: (page - 1) * PER_PAGE, take: PER_PAGE, select: { id: true, reference: true, status: true, locale: true, source: true, createdAt: true, followUpAt: true, assignedTo: { select: { name: true } }, items: { select: { titleSnapshot: true, quantity: true }, take: 3 }, _count: { select: { items: true } } } }),
    db.quoteRequest.count({ where }),
    db.quoteRequest.groupBy({ by: ["status"], where: { isTest: false }, _count: true }),
    db.quoteRequest.count({ where: { isTest: false, createdAt: { gte: today } } }),
    db.quoteRequest.count({ where: { isTest: false, followUpAt: { lt: new Date() }, status: { in: ["NEW", "IN_REVIEW", "QUOTE_PREPARED", "RESPONDED"] } } }),
    db.user.findMany({ where: { active: true, role: { in: ["SUPER_ADMIN", "ADMIN", "ORDER_OPERATOR"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const c = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const params = new URLSearchParams(Object.entries({ q, durum: status, sorumlu: assigned, kaynak: source, sirala: sort === "yeni" ? "" : sort }).filter(([, v]) => v));

  return (
    <>
      <PageHeader
        title="Teklif talepleri"
        description="Vitrindeki teklif formundan gelen gerçek kayıtlar. Listede kişisel veri yoktur; iletişim bilgileri yalnız yetkili detay ekranında görünür ve her görüntüleme kayda geçer."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ModuleState state="live" />
            {allowed(user.role, "quote.export") ? (
              <a href={`/admin/quotes/export?${params}`} className={buttonClass("secondary", "sm")}>
                <Download aria-hidden="true" className="size-4" /> CSV dışa aktar
              </a>
            ) : null}
          </div>
        }
      />
      <Notice className="mb-6">Panel müşteriye e-posta/SMS/WhatsApp göndermez (sağlayıcı ve alıcı adresi tanımlı değil). “Müşteriye iletildi” durumu, teklifin panel dışından gönderildiğini operatörün kaydetmesidir.</Notice>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Bugün gelen" value={todayCount} />
        <StatCard label="Yeni" value={c("NEW")} tone={c("NEW") ? "warning" : "neutral"} />
        <StatCard label="İşlemde" value={c("IN_REVIEW") + c("QUOTE_PREPARED")} />
        <StatCard label="Takibi geçmiş" value={overdue} tone={overdue ? "warning" : "neutral"} />
        <StatCard label="Sonuçlanan" value={c("CLOSED")} />
      </div>
      <FilterBar action="/admin/quotes" resetHref="/admin/quotes" label="Teklif filtreleri">
        <FilterSearch value={q} label="Referans / ürün" placeholder="TKL-2026… veya ürün adı" />
        <FilterSelect name="durum" label="Durum" value={status} options={[["", "Tümü"], ["acik", "Açık (yeni + işlemde)"], ...STATUSES.map((s) => [s, STATUS_LABEL[s]!] as [string, string])]} />
        <FilterSelect name="sorumlu" label="Sorumlu" value={assigned} options={[["", "Herkes"], ["benim", "Bana atanan"], ["atanmamis", "Atanmamış"], ...users.map((u) => [u.id, u.name] as [string, string])]} />
        <FilterSelect name="kaynak" label="Kaynak" value={source} options={[["", "Tümü"], ["QUOTE_LIST", "Teklif listesi"], ["PRODUCT_PAGE", "Ürün sayfası"]]} />
        <FilterSelect name="sirala" label="Sırala" value={sort} options={[["yeni", "En yeni"], ["eski", "En eski"], ["takip", "Takip tarihi"]]} />
      </FilterBar>
      <DataTable
        caption="Teklif talepleri"
        rows={rows}
        rowKey={(r) => r.id}
        empty="Filtreyle eşleşen talep yok."
        columns={[
          { key: "r", header: "Referans", cell: (r) => <Link href={`/admin/quotes/${r.id}`} className="font-mono font-semibold text-brand-700 hover:underline dark:text-brand-300">{r.reference}</Link> },
          { key: "d", header: "Tarih", cell: (r) => fmtDateTime(r.createdAt) },
          { key: "s", header: "Durum", cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
          { key: "p", header: "Ürünler", cell: (r) => <span className="text-xs">{r.items.map((i) => `${i.titleSnapshot} ×${i.quantity}`).join(", ")}{r._count.items > 3 ? ` +${r._count.items - 3}` : ""}</span> },
          { key: "a", header: "Sorumlu", cell: (r) => r.assignedTo?.name ?? <span className="text-steel">—</span> },
          { key: "f", header: "Takip", cell: (r) => (r.followUpAt ? <span className={r.followUpAt < new Date() && !["CLOSED", "SPAM"].includes(r.status) ? "font-semibold text-signal" : ""}>{fmtDate(r.followUpAt)}</span> : "—") },
          { key: "o", header: "Kaynak / dil", cell: (r) => `${r.source === "QUOTE_LIST" ? "Liste" : "Ürün"} · ${r.locale.toUpperCase()}` },
          { key: "x", header: "İşlemler", align: "end", cell: (r) => <RowActions id={String(r.id)} editHref={`/admin/quotes/${r.id}`} editLabel="Görüntüle" /> },
        ]}
      />
      <Pagination page={Math.min(page, pages)} pages={pages} total={total} href={(p) => `/admin/quotes?${new URLSearchParams([...params, ...(p > 1 ? [["sayfa", String(p)]] : [])])}`} />
    </>
  );
}
