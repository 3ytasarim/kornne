import Link from "next/link";
import { ActionForm, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/admin/ui";
import { Notice } from "@/components/ui/States";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { createProductAction } from "../actions";

export const metadata = { title: "Yeni ürün" };

export default async function NewProductPage() {
  await requireAdmin("products");
  const categories = await requireDb().category.findMany({ where: { isAllProducts: false }, orderBy: { sortOrder: "asc" }, include: { translations: { where: { locale: "tr" } } } });
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Ürünler
        </Link>
      </p>
      <PageHeader title="Yeni ürün" description="Ürün taslak olarak oluşur; içerik, görsel ve kategori tamamlanınca yayınlanır. Fiyat ayrı onay sürecinden geçer." />
      <Card className="max-w-2xl">
        <Notice className="mb-5">Yalnız gerçekten satılan ürünleri ekleyin. Teknik değer, fiyat, stok veya sertifika uydurulmaz.</Notice>
        <ActionForm action={createProductAction} className="space-y-4" aria-label="Yeni ürün">
          <Input name="title" label="Ürün adı (Türkçe)" required />
          <Input name="slug" label="Adres (slug)" required hint="Küçük harf ve tire, örn. yeni-urun-adi" />
          <Select name="categoryId" label="Kategori" required defaultValue="">
            <option value="" disabled>
              Seçin
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.translations[0]?.name ?? c.key}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Oluşturuluyor…">Taslak oluştur</SubmitButton>
            <FormMessage />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
