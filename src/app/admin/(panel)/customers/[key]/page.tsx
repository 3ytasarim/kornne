import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, KeyValues } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { fmtDateTime } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { getIpHash } from "@/lib/request-meta";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/quote/status-labels";
import { contactKey } from "@/lib/admin/quotes";

export const metadata = { title: "Müşteri" };
export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: PageProps<"/admin/customers/[key]">) {
  const user = await requireAdmin("customers");
  const { key } = await params;
  if (!/^[a-f0-9]{24}$/.test(key) || !allowed(user.role, "customer.view_pii")) notFound();
  const db = requireDb();
  const quotes = (await db.quoteRequest.findMany({ where: { isTest: false }, orderBy: { createdAt: "desc" }, select: { id: true, reference: true, status: true, createdAt: true, name: true, company: true, email: true, phone: true, _count: { select: { items: true } } } })).filter((q) => contactKey(q.email, q.phone) === key);
  if (!quotes.length) notFound();
  await db.auditLog.create({ data: { actorId: user.id, action: "customer.viewed", entityType: "Contact", entityId: key, ipHash: await getIpHash() } });
  const latest = quotes[0]!;
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/customers" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Müşteriler
        </Link>
      </p>
      <PageHeader title={latest.name} description={`${quotes.length} teklif talebi`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card title="İletişim (kişisel veri)">
          <KeyValues rows={[["Ad soyad", latest.name], ["Firma", latest.company], ["E-posta", latest.email], ["Telefon", latest.phone]]} />
          <p className="mt-3 text-xs text-steel">Bu görüntüleme denetim kaydına yazıldı.</p>
        </Card>
        <Card title="Talepler">
          <DataTable
            caption="Talepler"
            rows={quotes}
            rowKey={(q) => q.id}
            empty="—"
            columns={[
              { key: "r", header: "Referans", cell: (q) => <Link href={`/admin/quotes/${q.id}`} className="font-mono text-brand-700 hover:underline dark:text-brand-300">{q.reference}</Link> },
              { key: "d", header: "Tarih", cell: (q) => fmtDateTime(q.createdAt) },
              { key: "s", header: "Durum", cell: (q) => <Badge tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge> },
              { key: "i", header: "Ürün", align: "end", cell: (q) => q._count.items },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
