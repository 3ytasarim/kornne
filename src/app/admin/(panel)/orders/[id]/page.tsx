import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm, Area, ConfirmSubmit, FormMessage, Input, Select } from "@/components/admin/forms";
import { Card, KeyValues } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { allowed } from "@/lib/auth/rbac";
import { requireAdmin } from "@/lib/auth/guard";
import { formatIban } from "@/lib/commerce/iban";
import { requireDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { advanceOrderAction, confirmPaymentAction } from "../actions";
import { NOTICE_STATUS_TR, ORDER_STATUS_TR, PAYMENT_STATUS_TR, orderTone } from "../labels";

export const metadata = { title: "Sipariş" };

const NEXT_STEPS: Record<string, [string, string][]> = {
  PAID: [["PROCESSING", "Hazırlanıyor"], ["CANCELLED", "İptal"]],
  PROCESSING: [["SHIPPED", "Sevk edildi"], ["CANCELLED", "İptal"]],
  SHIPPED: [["DELIVERED", "Teslim edildi"]],
  AWAITING_PAYMENT: [["CANCELLED", "İptal (ödeme gelmedi)"]],
};

type Billing = { company?: string; taxOffice?: string; taxNumber?: string; name?: string; email?: string; phone?: string; city?: string; district?: string; address?: string; locale?: string };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin("orders");
  const { id } = await params;
  const db = requireDb();
  const o = await db.order.findUnique({
    where: { id },
    include: { items: true, statusEvents: { orderBy: { createdAt: "asc" } }, paymentNotices: { orderBy: { createdAt: "desc" }, include: { bankAccount: { select: { bankName: true, iban: true } } } } },
  });
  if (!o) notFound();
  const b = (o.billing ?? {}) as Billing;
  const ship = (o.shipping ?? {}) as { sameAsBilling?: boolean; address?: string };
  const canConfirm = allowed(user.role, "order.confirm_payment") && o.status === "AWAITING_PAYMENT" && o.paymentMethod === "BANK_TRANSFER";
  const steps = allowed(user.role, "order.manage") ? (NEXT_STEPS[o.status] ?? []) : [];
  const total = formatMoney(o.totalMinor, o.currency);

  return (
    <>
      <PageHeader
        title={`Sipariş ${o.number}`}
        description={`${fmtDateTime(o.placedAt)} · ${o.paymentMethod === "BANK_TRANSFER" ? "EFT / Havale" : (o.paymentMethod ?? "—")}`}
        actions={
          <span className="flex flex-wrap gap-2">
            <Badge tone={orderTone(o.status)}>{ORDER_STATUS_TR[o.status] ?? o.status}</Badge>
            <Badge tone="outline">{PAYMENT_STATUS_TR[o.paymentStatus] ?? o.paymentStatus}</Badge>
            {o.isTest ? <Badge tone="neutral">TEST</Badge> : null}
          </span>
        }
      />
      <p className="mb-6">
        <Link href="/admin/orders" className="text-sm font-semibold text-brand-700 underline dark:text-brand-300">
          ← Siparişler
        </Link>
      </p>

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card title="Ürünler">
            <DataTable
              caption="Sipariş kalemleri"
              empty="Kalem yok."
              rows={o.items}
              rowKey={(i) => i.id}
              columns={[
                { key: "t", header: "Ürün", cell: (i) => i.titleSnapshot },
                { key: "q", header: "Adet", align: "end", cell: (i) => i.quantity },
                { key: "u", header: "Birim (KDV dahil)", align: "end", cell: (i) => formatMoney(i.unitPriceMinor, o.currency) },
                { key: "l", header: "Tutar", align: "end", cell: (i) => formatMoney(i.lineTotalMinor, o.currency) },
              ]}
            />
            <KeyValues
              rows={[
                ["Ara toplam (KDV hariç)", formatMoney(o.subtotalMinor, o.currency)],
                ["KDV", formatMoney(o.taxMinor, o.currency)],
                ["Genel toplam", <strong key="t">{total}</strong>],
                ...(o.fxRate4 ? ([["Sipariş kuru (TCMB satış)", `1 ${o.fxCurrency} = ${(o.fxRate4 / 10_000).toLocaleString("tr-TR", { minimumFractionDigits: 4 })} TL`]] as [string, string][]) : []),
              ]}
            />
          </Card>

          <Card title="Ödeme bildirimleri" description="Müşterinin /odeme-bildirimi formundan gönderdiği kayıtlar. Banka hesap hareketiyle karşılaştırın.">
            <DataTable
              caption="Ödeme bildirimleri"
              rows={o.paymentNotices}
              rowKey={(n) => n.id}
              empty="Henüz ödeme bildirimi yok."
              columns={[
                { key: "d", header: "Gönderim", cell: (n) => fmtDateTime(n.createdAt) },
                { key: "p", header: "Gönderen", cell: (n) => n.payerName },
                { key: "b", header: "Banka", cell: (n) => (n.bankAccount ? `${n.bankAccount.bankName} · …${formatIban(n.bankAccount.iban).slice(-7)}` : "—") },
                { key: "a", header: "Tutar", align: "end", cell: (n) => (n.amountMinor !== null ? formatMoney(n.amountMinor, o.currency) : "—") },
                { key: "t", header: "Ödeme tarihi", cell: (n) => (n.paidAt ? n.paidAt.toISOString().slice(0, 10) : "—") },
                { key: "s", header: "Durum", cell: (n) => NOTICE_STATUS_TR[n.status] ?? n.status },
              ]}
            />
            {o.paymentNotices.some((n) => n.amountMinor !== null && n.amountMinor !== o.totalMinor) ? (
              <Notice tone="warning" className="mt-4">
                Bildirilen tutar sipariş toplamından ({total}) farklı — hesap hareketini dikkatle kontrol edin.
              </Notice>
            ) : null}
          </Card>

          <Card title="Durum geçmişi">
            <ol className="space-y-2 text-sm">
              {o.statusEvents.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3">
                  <span className="text-steel tabular-nums">{fmtDateTime(e.createdAt)}</span>
                  <span className="font-semibold">{ORDER_STATUS_TR[e.toStatus] ?? e.toStatus}</span>
                  <span className="text-steel">
                    {e.actor}
                    {e.reason ? ` — ${e.reason}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {canConfirm ? (
            <Card title="EFT / Havale onayı" description={`Banka hesabınıza ${total} tutarında, açıklamasında ${o.number} geçen bir ödeme geldiyse onaylayın.`}>
              <ActionForm action={confirmPaymentAction} className="space-y-3">
                <input type="hidden" name="orderId" value={o.id} />
                <Input name="note" label="Kontrol notu" required placeholder="ör. Vakıfbank hesap hareketi 23.10 14:05" />
                <FormMessage />
                <ConfirmSubmit variant="primary" size="md" confirmText="Ödemeyi onaylıyorum — tekrar tıklayın">
                  Ödemeyi onayla
                </ConfirmSubmit>
              </ActionForm>
            </Card>
          ) : null}

          {steps.length ? (
            <Card title="Durumu ilerlet">
              <ActionForm action={advanceOrderAction} className="space-y-3">
                <input type="hidden" name="orderId" value={o.id} />
                <Select name="to" label="Yeni durum" required defaultValue="">
                  <option value="" disabled>
                    Seçin
                  </option>
                  {steps.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
                <Area name="reason" label="Not (müşteriye gösterilmez)" rows={2} />
                <FormMessage />
                <ConfirmSubmit variant="outline" size="md">
                  Durumu güncelle
                </ConfirmSubmit>
              </ActionForm>
            </Card>
          ) : null}

          <Card title="Fatura bilgileri">
            <KeyValues
              rows={[
                ["Firma", b.company ?? "—"],
                // foreign orders: no tax office, tax number = company tax / VAT ID, district field = country
                (b.locale ?? "tr") === "tr" ? ["Vergi dairesi / no", `${b.taxOffice || "—"} / ${b.taxNumber ?? "—"}`] : ["Vergi / VAT no (yurt dışı)", b.taxNumber ?? "—"],
                ["Yetkili", b.name ?? "—"],
                ["E-posta", b.email ? <a key="e" href={`mailto:${b.email}`} className="underline">{b.email}</a> : "—"],
                ["Telefon", b.phone ? <a key="p" href={`tel:${b.phone}`} className="underline">{b.phone}</a> : "—"],
                (b.locale ?? "tr") === "tr" ? ["Adres", `${b.address ?? ""} ${b.district ?? ""} / ${b.city ?? ""}`] : ["Adres", `${b.address ?? ""}, ${b.city ?? ""} / ${b.district ?? ""} (ülke)`],
                ["Teslimat", ship.sameAsBilling ? "Fatura adresiyle aynı" : (ship.address ?? "—")],
                ["Dil", b.locale ?? "tr"],
              ]}
            />
            {o.note ? <p className="mt-3 rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm">Not: {o.note}</p> : null}
          </Card>
        </div>
      </div>
    </>
  );
}
