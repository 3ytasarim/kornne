import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmSubmit, FormMessage, OneTimeValue, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, KeyValues } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { fmtDateTime } from "@/lib/admin/format";
import { PENDING_PASSWORD } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/guard";
import { ROLE_LABELS, ROLES } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { changeRoleAction, resetLinkAction, revokeSessionsAction, setActiveAction } from "../actions";

export const metadata = { title: "Kullanıcı" };

export default async function UserDetail({ params }: PageProps<"/admin/users/[id]">) {
  const me = await requireAdmin("users");
  const { id } = await params;
  const db = requireDb();
  const u = await db.user.findUnique({ where: { id }, include: { sessions: { orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, expiresAt: true } }, invites: { orderBy: { createdAt: "desc" }, take: 5 } } });
  if (!u) notFound();
  const logs = await db.auditLog.findMany({ where: { OR: [{ entityType: "User", entityId: u.id }, { actorId: u.id }] }, orderBy: { createdAt: "desc" }, take: 30 });
  const self = me.id === u.id;
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/users" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Kullanıcılar
        </Link>
      </p>
      <PageHeader title={u.name} description={u.email} actions={!u.active ? <Badge tone="outline">Pasif</Badge> : u.passwordHash === PENDING_PASSWORD ? <Badge tone="warning">Davet bekliyor</Badge> : <Badge tone="success">Aktif</Badge>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Hesap">
          <KeyValues rows={[["Rol", ROLE_LABELS[u.role]], ["Son giriş", fmtDateTime(u.lastLoginAt)], ["Oluşturuldu", fmtDateTime(u.createdAt)], ["Açık oturum", u.sessions.filter((s) => s.expiresAt > new Date()).length], ["MFA", "Etkin değil (hazırlık)"]]} />
          {self ? <p className="mt-3 text-xs text-steel">Kendi rolünüzü değiştiremez, hesabınızı pasif yapamazsınız.</p> : null}
        </Card>
        {!self ? (
          <Card title="Yönetim">
            <div className="space-y-5">
              <ActionForm action={changeRoleAction} className="flex flex-wrap items-end gap-3" aria-label="Rol değiştir">
                <input type="hidden" name="userId" value={u.id} />
                <Select name="role" label="Rol" defaultValue={u.role} className="min-w-56">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
                <SubmitButton variant="secondary">Rolü kaydet</SubmitButton>
                <FormMessage className="w-full" />
              </ActionForm>
              <ActionForm action={resetLinkAction} className="space-y-2" aria-label="Şifre sıfırlama bağlantısı">
                <input type="hidden" name="userId" value={u.id} />
                <SubmitButton variant="secondary">{u.passwordHash === PENDING_PASSWORD ? "Yeni davet bağlantısı" : "Şifre sıfırlama bağlantısı oluştur"}</SubmitButton>
                <FormMessage />
                <OneTimeValue k="link" label="Bağlantı (yalnız şimdi gösterilir)" />
              </ActionForm>
              <div className="flex flex-wrap gap-3">
                <ActionForm action={revokeSessionsAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <ConfirmSubmit>Tüm oturumları kapat</ConfirmSubmit>
                  <FormMessage />
                </ActionForm>
                <ActionForm action={setActiveAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                  {u.active ? <ConfirmSubmit>Pasif yap</ConfirmSubmit> : <SubmitButton variant="secondary">Etkinleştir</SubmitButton>}
                  <FormMessage />
                </ActionForm>
              </div>
            </div>
          </Card>
        ) : null}
        <Card title="Son işlemler" className="xl:col-span-2">
          {logs.length === 0 ? <p className="text-sm text-steel">Kayıt yok.</p> : null}
          <ul className="space-y-1 text-sm">
            {logs.map((l) => (
              <li key={l.id}>
                <span className="text-steel">{fmtDateTime(l.createdAt)}</span> — <code className="text-xs">{l.action}</code> {l.entityType}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
