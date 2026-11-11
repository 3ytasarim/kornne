import { PageHeader } from "@/components/admin/PageHeader";
import { ActionForm, Check, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { Card } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { allowed } from "@/lib/auth/rbac";
import { requireAdmin } from "@/lib/auth/guard";
import { ensureDefaultBanks } from "@/lib/commerce/bank-accounts";
import { formatIban, isValidTrIban } from "@/lib/commerce/iban";
import { requireDb } from "@/lib/db";
import { saveBankAccountAction } from "./actions";

export const metadata = { title: "Banka hesapları" };

/**
 * EFT/Havale accounts shown on /banka-hesaplari, the order confirmation and /odeme-bildirimi. An account is public only
 * when it is ACTIVE and has a checksum-valid TR IBAN. The six client banks are pre-created (inactive, empty IBAN).
 */
export default async function BankAccountsAdminPage() {
  const user = await requireAdmin("settings");
  const db = requireDb();
  await ensureDefaultBanks(db);
  const rows = await db.bankAccount.findMany({ orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }] });
  const editable = allowed(user.role, "bank.manage");
  const live = rows.filter((r) => r.active && isValidTrIban(r.iban)).length;
  return (
    <>
      <PageHeader title="Banka hesapları" description={`Sitede yayında: ${live} / ${rows.length}. IBAN girilip "Sitede göster" işaretlenen hesaplar müşteriye gösterilir.`} />
      <Notice tone="info" className="mb-6">
        Türkçe siparişler TL hesaplara, diğer dillerdeki siparişler USD hesaplara ödenir — yabancı müşterinin sipariş verebilmesi için en az bir aktif USD hesabı gerekir. IBAN, kaydedilirken TR biçimi ve kontrol hanesiyle doğrulanır. Değişiklikler denetim kaydına yazılır (IBAN değerinin kendisi değil, değiştiği bilgisi). Sitede en geç 1 dakika içinde görünür.
      </Notice>
      <div className="grid gap-6 lg:grid-cols-2">
        {rows.map((r) => (
          <Card
            key={r.id}
            title={r.bankName}
            actions={r.active && isValidTrIban(r.iban) ? <Badge tone="success">Yayında</Badge> : <Badge tone="outline">Gösterilmiyor</Badge>}
            description={r.iban ? <span className="font-mono">{formatIban(r.iban)} · {r.currency}</span> : `IBAN girilmedi · ${r.currency}`}
          >
            <ActionForm action={saveBankAccountAction} className="space-y-3">
              <input type="hidden" name="id" value={r.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="bankName" label="Banka" defaultValue={r.bankName} required disabled={!editable} />
                <Input name="branch" label="Şube (isteğe bağlı)" defaultValue={r.branch ?? ""} disabled={!editable} />
              </div>
              <Input name="accountHolder" label="Hesap sahibi" defaultValue={r.accountHolder} required disabled={!editable} />
              <Input name="iban" label="IBAN" defaultValue={r.iban ? formatIban(r.iban) : ""} placeholder="TR00 0000 0000 0000 0000 0000 00" dir="ltr" className="font-mono" disabled={!editable} />
              <div className="grid items-end gap-3 sm:grid-cols-2">
                <Input name="sortOrder" label="Sıra" type="number" min={0} max={999} defaultValue={String(r.sortOrder)} disabled={!editable} />
                <Select disabled={!editable} name="currency" label="Para birimi" defaultValue={r.currency}>
                  <option value="TRY">TL (Türkçe siparişler)</option>
                  <option value="USD">USD (diğer diller)</option>
                  <option value="EUR">EUR</option>
                </Select>
                <Check name="active" label="Sitede göster" defaultChecked={r.active} disabled={!editable} />
              </div>
              <FormMessage />
              {editable ? <SubmitButton pendingText="Kaydediliyor…">Kaydet</SubmitButton> : null}
            </ActionForm>
          </Card>
        ))}
        {editable ? (
          <Card title="Yeni hesap" description="Örn. döviz hesabı veya başka bir banka.">
            <ActionForm action={saveBankAccountAction} className="space-y-3" resetOnOk>
              <Input name="bankName" label="Banka" required />
              <Input name="accountHolder" label="Hesap sahibi" defaultValue="Mezbaha Teknolojileri A.Ş." required />
              <Input name="iban" label="IBAN" dir="ltr" className="font-mono" />
              <Input name="branch" label="Şube (isteğe bağlı)" />
              <Input name="sortOrder" label="Sıra" type="number" min={0} max={999} defaultValue="100" />
              <Select name="currency" label="Para birimi" defaultValue="USD">
                  <option value="TRY">TL (Türkçe siparişler)</option>
                  <option value="USD">USD (diğer diller)</option>
                  <option value="EUR">EUR</option>
                </Select>
              <Check name="active" label="Sitede göster" />
              <FormMessage />
              <SubmitButton pendingText="Ekleniyor…">Ekle</SubmitButton>
            </ActionForm>
          </Card>
        ) : null}
      </div>
    </>
  );
}
