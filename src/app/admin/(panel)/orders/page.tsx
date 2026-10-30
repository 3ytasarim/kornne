import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, FilterBar, FilterSelect, ModuleState } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { commerceGate } from "@/lib/commerce/gate";
import { requireDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { ORDER_STATUS_TR, PAYMENT_STATUS_TR, orderTone } from "./labels";
import { RowActions } from "@/components/admin/RowActions";

export const metadata = { title: "Siparişler" };

/** B2B orders (EFT/Havale, Sprint 12): list with payment-notice signal; detail page confirms transfers. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("orders");
  const { status = "" } = await searchParams;
  const db = requireDb();
  const where = status && status in ORDER_STATUS_TR ? { status: status as never } : {};
  const [orders, counts] = await Promise.all([
    db.order.findMany({ where, orderBy: { placedAt: "desc" }, take: 100, select: { id: true, number: true, status: true, paymentStatus: true, paymentMethod: true, totalMinor: true, currency: true, placedAt: true, billing: true, isTest: true, _count: { select: { paymentNotices: { where: { status: "PENDING" } } } } } }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const gate = commerceGate();
  const awaiting = counts.find((c) => c.status === "AWAITING_PAYMENT")?._count ?? 0;
  return (
    <>
      <PageHeader
        title="Siparişler"
        description="EFT / Havale ile verilen kurumsal siparişler. Ödeme bildirimi gelen siparişleri banka hesap hareketiyle kontrol edip onaylayın."
        actions={<ModuleState state={gate.enabled ? "live" : "blocked"} title={gate.enabled ? "Online sipariş açık (EFT/Havale)" : "Online sipariş kapalı — ön koşullar eksik"} />}
      />
      {awaiting ? (
        <Notice tone="warning" className="mb-6">
          {awaiting} sipariş ödeme bekliyor. Ödeme bildirimi olanlar listede işaretli.
        </Notice>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <FilterBar action="/admin/orders" resetHref="/admin/orders">
            <FilterSelect name="status" label="Durum" value={status} options={[["", "Tümü"], ...Object.entries(ORDER_STATUS_TR)]} />
          </FilterBar>
          <DataTable
            caption="Siparişler"
            rows={orders}
            rowKey={(o) => o.id}
            empty="Sipariş yok."
            columns={[
              {
                key: "n",
                header: "No",
                cell: (o) => (
                  <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
                    {o.number}
                  </Link>
                ),
              },
              { key: "c", header: "Firma", cell: (o) => ((o.billing ?? {}) as { company?: string }).company ?? "—" },
              {
                key: "s",
                header: "Durum",
                cell: (o) => (
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={orderTone(o.status)}>{ORDER_STATUS_TR[o.status] ?? o.status}</Badge>
                    {o._count.paymentNotices ? <Badge tone="warning">Bildirim: {o._count.paymentNotices}</Badge> : null}
                    {o.isTest ? <Badge tone="neutral">TEST</Badge> : null}
                  </span>
                ),
              },
              { key: "p", header: "Ödeme", cell: (o) => `${PAYMENT_STATUS_TR[o.paymentStatus] ?? o.paymentStatus}${o.paymentMethod === "BANK_TRANSFER" ? " · EFT/Havale" : ""}` },
              { key: "t", header: "Tutar", align: "end", cell: (o) => formatMoney(o.totalMinor, o.currency) },
              { key: "d", header: "Tarih", cell: (o) => fmtDateTime(o.placedAt) },
              { key: "x", header: "İşlemler", align: "end", cell: (o) => <RowActions id={String(o.id)} editHref={`/admin/orders/${o.id}`} editLabel="Görüntüle" /> },
            ]}
          />
        </div>
        <div className="space-y-6">
          <Card title="Durumlara göre">
            <ul className="space-y-1 text-sm">
              {Object.entries(ORDER_STATUS_TR).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3">
                  <Link href={`/admin/orders?status=${k}`} className="text-ink-2 hover:text-ink">
                    {v}
                  </Link>
                  <span className="font-semibold tabular-nums">{counts.find((c) => c.status === k)?._count ?? 0}</span>
                </li>
              ))}
            </ul>
          </Card>
          {!gate.enabled ? (
            <Card title="Satış kapısı ön koşulları">
              <ul className="list-disc space-y-1 ps-5 text-sm text-steel">
                {gate.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card title="Banka hesapları">
            <p className="text-sm text-steel">Müşteriye gösterilen IBAN’lar.</p>
            <Link href="/admin/bank-accounts" className="mt-2 inline-flex text-sm font-semibold text-brand-700 underline dark:text-brand-300">
              Banka hesaplarını yönet
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
