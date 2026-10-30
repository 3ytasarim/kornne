import Link from "next/link";
import { ActionForm, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/admin/ui";
import { Notice } from "@/components/ui/States";
import { requireAdmin } from "@/lib/auth/guard";
import { LOCALE_META, LOCALES } from "@/lib/i18n/config";
import { createPageAction } from "../actions";

export const metadata = { title: "Yeni içerik" };

export default async function NewContentPage() {
  await requireAdmin("content");
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/content" className="text-brand-700 hover:underline dark:text-brand-300">
          ← İçerik
        </Link>
      </p>
      <PageHeader title="Yeni içerik" description="Taslak olarak oluşur; metni yazıp önizledikten sonra yayınlanır." />
      <Card className="max-w-2xl">
        <Notice className="mb-5">Kaynağı doğrulanmamış referans, başarı hikâyesi, sertifika veya görsel eklemeyin.</Notice>
        <ActionForm action={createPageAction} className="space-y-4" aria-label="Yeni içerik">
          <Select name="kind" label="Tür" defaultValue="CORPORATE">
            <option value="CORPORATE">Kurumsal sayfa</option>
            <option value="INFO">Bilgi sayfası</option>
            <option value="LEGAL">Yasal metin</option>
            <option value="BLOG">Blog / haber yazısı</option>
          </Select>
          <Input name="key" label="İç anahtar" required hint="Değişmez tanımlayıcı, örn. hakkimizda" />
          <Select name="locale" label="İlk dil" defaultValue="tr">
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_META[l].nativeName}
              </option>
            ))}
          </Select>
          <Input name="title" label="Başlık" required />
          <Input name="slug" label="Adres (slug)" required hint="Örn. hakkimizda — yayınlanınca /sayfa/… veya /blog/… olur" />
          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton pendingText="Oluşturuluyor…">Taslak oluştur</SubmitButton>
            <FormMessage />
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
