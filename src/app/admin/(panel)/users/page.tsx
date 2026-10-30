import Link from "next/link";
import { ActionForm, FormMessage, Input, OneTimeValue, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, ModuleState } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { PENDING_PASSWORD } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guard";
import { ROLE_LABELS, ROLES } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { inviteUserAction } from "./actions";

export const metadata = { title: "Kullanıcılar" };

export default async function UsersPage() {
  await requireAdmin("users");
  const users = await requireDb().user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true, passwordHash: true, _count: { select: { sessions: true } } } });
  return (
    <>
      <PageHeader title="Kullanıcılar ve roller" description="Varsayılan hesap veya şifre yoktur. Yeni kullanıcı tek kullanımlık davet bağlantısıyla kendi şifresini belirler." actions={<ModuleState state="live" />} />
      <Notice className="mb-6">E-posta sağlayıcısı olmadığı için davet/sıfırlama bağlantıları e-postayla gönderilmez; bağlantı yalnız bir kez gösterilir, kişiye güvenli bir kanaldan iletilir. MFA mimarisi hazır (alan mevcut) ancak etkin değil.</Notice>
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <DataTable
          caption="Kullanıcılar"
          rows={users}
          rowKey={(u) => u.id}
          empty="Kullanıcı yok"
          columns={[
            { key: "n", header: "Ad", cell: (u) => <Link href={`/admin/users/${u.id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">{u.name}</Link> },
            { key: "e", header: "E-posta", cell: (u) => u.email },
            { key: "r", header: "Rol", cell: (u) => ROLE_LABELS[u.role] },
            { key: "s", header: "Durum", cell: (u) => (!u.active ? <Badge tone="outline">Pasif</Badge> : u.passwordHash === PENDING_PASSWORD ? <Badge tone="warning">Davet bekliyor</Badge> : <Badge tone="success">Aktif</Badge>) },
            { key: "l", header: "Son giriş", cell: (u) => fmtDateTime(u.lastLoginAt) },
            { key: "o", header: "Oturum", align: "end", cell: (u) => u._count.sessions },
          ]}
        />
        <Card title="Kullanıcı davet et">
          <ActionForm action={inviteUserAction} className="space-y-4" aria-label="Kullanıcı davet et" resetOnOk>
            <Input name="name" label="Ad soyad" required />
            <Input name="email" type="email" label="E-posta" required />
            <Select name="role" label="Rol" defaultValue="PRODUCT_EDITOR">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="Oluşturuluyor…">Davet oluştur</SubmitButton>
            </div>
            <FormMessage />
            <OneTimeValue k="link" label="Davet bağlantısı (yalnız şimdi gösterilir)" hint="Bu bağlantı kaydedilmez; sayfadan ayrılınca tekrar görüntülenemez. Gerekirse yeni bağlantı oluşturun." />
          </ActionForm>
        </Card>
      </div>
      <Card title="Rol yetkileri" className="mt-6" description="Ayrıntılı matris: docs/architecture/admin-permission-matrix.md">
        <ul className="grid gap-2 text-sm md:grid-cols-2">
          <li><strong>Süper Yönetici:</strong> her şey + kullanıcı/rol yönetimi, firma bilgisi doğrulama.</li>
          <li><strong>Yönetici:</strong> kullanıcı yönetimi hariç her şey; fiyat ve içerik onayı.</li>
          <li><strong>Ürün Editörü:</strong> ürün, kategori, medya, fiyat ÖNERİSİ (onay yok), eşleşme kararı.</li>
          <li><strong>Sipariş Operatörü:</strong> teklif CRM ve müşteri bilgileri (dışa aktarma yok).</li>
          <li><strong>SEO / İçerik Editörü:</strong> içerik taslağı, menü, SSS, SEO alanları, çeviri yayını; içerik yayınlama yok.</li>
        </ul>
      </Card>
    </>
  );
}
