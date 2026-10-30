import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ModuleState } from "@/components/admin/ui";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";

export const metadata = { title: "Stok" };

/** Inventory: no stock data exists at the source (all UNKNOWN). Read-only until the client provides real stock/lead times. */
export default async function InventoryPage() {
  await requireAdmin("inventory");
  const rows = await requireDb().inventory.findMany({ include: { product: { select: { id: true, sourceKey: true, translations: { where: { locale: "tr" }, select: { title: true } } } } }, orderBy: { product: { sortOrder: "asc" } } });
  const unknown = rows.filter((r) => r.availability === "UNKNOWN").length;
  return (
    <>
      <PageHeader title="Stok ve termin" description={`${rows.length} kayıt · ${unknown} tanesi “bilinmiyor”.`} actions={<ModuleState state="prep" title="Kaynakta stok verisi yok" />} />
      <Notice className="mb-6">Eski sitede stok/termin bilgisi yok. Vitrinde “stokta”, “kargoya hazır” gibi ifade gösterilmez; teklifte bildirilir. Müşteri gerçek stok/üretim süresi verisi sağladığında bu ekran düzenlenebilir hâle getirilecek (Sprint 9 Merchant için gerekli).</Notice>
      <DataTable
        caption="Stok"
        rows={rows}
        rowKey={(r) => r.id}
        empty="—"
        columns={[
          { key: "p", header: "Ürün", cell: (r) => <Link href={`/admin/products/${r.product.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{r.product.translations[0]?.title}</Link> },
          { key: "n", header: "No", cell: (r) => `#${r.product.sourceKey?.split(":").pop() ?? "—"}` },
          { key: "a", header: "Durum", cell: (r) => (r.availability === "UNKNOWN" ? "Bilinmiyor" : r.availability) },
          { key: "q", header: "Adet", align: "end", cell: (r) => r.quantity ?? "—" },
          { key: "l", header: "Termin (gün)", align: "end", cell: (r) => r.leadTimeDays ?? "—" },
        ]}
      />
    </>
  );
}
