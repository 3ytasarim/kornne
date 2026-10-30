import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { ModuleState } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";

export const metadata = { title: "Kategoriler" };

export default async function CategoriesPage() {
  await requireAdmin("products");
  const cats = await requireDb().category.findMany({ orderBy: { sortOrder: "asc" }, include: { translations: true, _count: { select: { products: true } } } });
  return (
    <>
      <PageHeader title="Kategoriler" description="Kategori adları, adresleri, açıklamaları ve SEO alanları her dil için ayrı. Adres değişirse eski adres 301 ile yönlenir." actions={<ModuleState state="live" />} />
      <DataTable
        caption="Kategoriler"
        rows={cats}
        rowKey={(c) => c.id}
        empty="Kategori yok"
        columns={[
          { key: "n", header: "Kategori (TR)", cell: (c) => <Link href={`/admin/categories/${c.id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{c.translations.find((t) => t.locale === "tr")?.name ?? c.key}</Link> },
          { key: "k", header: "Anahtar", cell: (c) => <code className="text-xs">{c.key}</code> },
          { key: "p", header: "Ürün", align: "end", cell: (c) => (c.isAllProducts ? <Badge tone="outline">sanal liste</Badge> : c._count.products) },
          { key: "l", header: "Diller", cell: (c) => c.translations.map((t) => t.locale.toUpperCase()).join(", ") },
          { key: "s", header: "SEO başlığı", cell: (c) => `${c.translations.filter((t) => t.seoTitle).length}/${c.translations.length}` },
          { key: "d", header: "Durum", cell: (c) => (c.status === "PUBLISHED" ? <Badge tone="success">Yayında</Badge> : <Badge tone="neutral">{c.status}</Badge>) },
        ]}
      />
    </>
  );
}
