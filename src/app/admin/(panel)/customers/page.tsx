import Link from "next/link";

import { PageHeader } from "@/components/admin/PageHeader";
import { ModuleState, Pagination } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDateTime, pageParam } from "@/lib/admin/format";
import { contactKey, maskEmail, maskPhone } from "@/lib/admin/quotes";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { RowActions } from "@/components/admin/RowActions";

export const metadata = { title: "Müşteriler" };
export const dynamic = "force-dynamic";
const PER_PAGE = 30;


/**
 * Customers = people who sent quote requests (no customer accounts exist yet; the legacy shop's accounts were not
 * migrated). Derived from QuoteRequest — no second copy of personal data. Masked in the list; full detail is audited.
 */
export default async function CustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  await requireAdmin("customers");
  const page = pageParam((await searchParams).sayfa);
  const db = requireDb();
  const [quotes, accounts] = await Promise.all([db.quoteRequest.findMany({ where: { isTest: false }, select: { email: true, phone: true, company: true, createdAt: true, status: true } }), db.customer.count()]);
  const groups = new Map<string, { key: string; email: string | null; phone: string | null; hasCompany: boolean; count: number; last: Date; open: number }>();
  for (const q of quotes) {
    const key = contactKey(q.email, q.phone);
    const g = groups.get(key) ?? { key, email: q.email, phone: q.phone, hasCompany: false, count: 0, last: q.createdAt, open: 0 };
    g.count++;
    g.hasCompany ||= !!q.company;
    if (q.createdAt > g.last) g.last = q.createdAt;
    if (["NEW", "IN_REVIEW", "QUOTE_PREPARED"].includes(q.status)) g.open++;
    groups.set(key, g);
  }
  const rows = [...groups.values()].sort((a, b) => +b.last - +a.last);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const cur = Math.min(page, pages);
  return (
    <>
      <PageHeader title="Müşteriler" description="Teklif gönderen kişiler (e-posta/telefona göre gruplanır). Liste maskelidir; ayrıntı yetkili ve denetim kayıtlıdır." actions={<ModuleState state="partial" title="Müşteri hesapları yok; yalnız teklif kişileri" />} />
      <Notice className="mb-6">Online müşteri hesabı sistemi henüz yok ({accounts} hesap). Eski sitedeki hesaplar, şifreler ve siparişler açık migrasyon onayı olmadan taşınmadı.</Notice>
      <DataTable
        caption="Teklif kişileri"
        rows={rows.slice((cur - 1) * PER_PAGE, cur * PER_PAGE)}
        rowKey={(r) => r.key}
        empty="Henüz teklif gönderen yok."
        columns={[
          { key: "c", header: "Kişi (maskeli)", cell: (r) => <Link href={`/admin/customers/${r.key}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{r.email ? maskEmail(r.email) : maskPhone(r.phone)}</Link> },
          { key: "t", header: "Telefon", cell: (r) => maskPhone(r.phone) },
          { key: "f", header: "Firma", cell: (r) => (r.hasCompany ? "Var" : "—") },
          { key: "n", header: "Talep", align: "end", cell: (r) => r.count },
          { key: "o", header: "Açık", align: "end", cell: (r) => r.open },
          { key: "l", header: "Son talep", cell: (r) => fmtDateTime(r.last) },
          { key: "x", header: "İşlemler", align: "end", cell: (r) => <RowActions id={String(r.key)} editHref={`/admin/customers/${r.key}`} editLabel="Görüntüle" /> },
        ]}
      />
      <Pagination page={cur} pages={pages} total={rows.length} href={(p) => `/admin/customers?sayfa=${p}`} />
    </>
  );
}
