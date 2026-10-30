import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Area, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, KeyValues } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDate, fmtDateTime, isoDay } from "@/lib/admin/format";
import { QUOTE_TRANSITIONS } from "@/lib/admin/quotes";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { getIpHash } from "@/lib/request-meta";
import { OUTCOME_LABEL, STATUS_LABEL, STATUS_TONE } from "@/lib/quote/status-labels";
import { addNoteAction, assignAction, changeStatusAction, followUpAction } from "../actions";

export const metadata = { title: "Teklif talebi" };
export const dynamic = "force-dynamic";

/** Quote detail + CRM. Contact PII: quotes roles only (server-checked), every view audited. */
export default async function QuoteDetailPage({ params }: PageProps<"/admin/quotes/[id]">) {
  const user = await requireAdmin("quotes");
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/.test(id)) notFound();
  const db = requireDb();
  const q = await db.quoteRequest.findFirst({
    where: { id, isTest: false },
    include: {
      items: { orderBy: { titleSnapshot: "asc" }, include: { product: { select: { id: true } } } },
      events: { orderBy: { createdAt: "asc" } },
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!q) notFound();
  const canPii = allowed(user.role, "quote.view_pii");
  const canManage = allowed(user.role, "quote.manage");
  if (canPii) await db.auditLog.create({ data: { actorId: user.id, action: "quote.viewed", entityType: "QuoteRequest", entityId: q.id, ipHash: await getIpHash() } });
  const [actors, assignees, outbox] = await Promise.all([
    db.user.findMany({ where: { id: { in: q.events.map((e) => e.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { active: true, role: { in: ["SUPER_ADMIN", "ADMIN", "ORDER_OPERATOR"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.notificationOutbox.findMany({ where: { entityType: "QuoteRequest", entityId: q.id } }),
  ]);
  const next = QUOTE_TRANSITIONS[q.status];
  const actorName = (id: string | null) => (id ? (actors.find((a) => a.id === id)?.name ?? "kullanıcı") : "sistem");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/quotes" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Teklif talepleri
        </Link>
      </p>
      <PageHeader title={q.reference} description={`${fmtDateTime(q.createdAt)} · ${q.locale.toUpperCase()} · ${q.source === "QUOTE_LIST" ? "Teklif listesi" : "Ürün sayfası"}`} actions={<Badge tone={STATUS_TONE[q.status]}>{STATUS_LABEL[q.status]}</Badge>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          {canPii ? (
            <Card title="İletişim (kişisel veri)">
              <KeyValues
                rows={[
                  ["Ad soyad", q.name],
                  ["Firma", q.company],
                  ["E-posta", q.email],
                  ["Telefon", q.phone],
                  ["Aydınlatma metni sürümü", q.privacyNoticeVersion],
                  ["Saklama bitişi (taslak)", fmtDate(q.retainUntil)],
                ]}
              />
              {q.message ? (
                <div className="mt-4 rounded-[var(--radius-md)] bg-surface-2 p-3">
                  <p className="mb-1 text-xs font-semibold text-steel">Müşteri notu</p>
                  <p className="text-sm whitespace-pre-wrap text-ink">{q.message}</p>
                </div>
              ) : null}
            </Card>
          ) : null}

          <Card title="Durum" description="Geçersiz geçişler engellenir. Aynı anda iki kişi güncellerse ikincisi uyarı alır.">
            {canManage && next.length ? (
              <ActionForm action={changeStatusAction} className="space-y-3" aria-label="Durum değiştir">
                <input type="hidden" name="id" value={q.id} />
                <input type="hidden" name="version" value={q.version} />
                <Select name="to" label="Yeni durum" defaultValue={next[0]}>
                  {next.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
                {next.includes("CLOSED") ? (
                  <Select name="outcome" label="Sonuç (Sonuçlandı seçilirse)" defaultValue="">
                    <option value="">—</option>
                    {Object.entries(OUTCOME_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Area name="note" label="Not" rows={2} hint="“Müşteriye iletildi” için nasıl gönderildiğini yazın (panel e-posta göndermez)." />
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton pendingText="Kaydediliyor…">Durumu güncelle</SubmitButton>
                  <FormMessage />
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-steel">{canManage ? "Bu durumdan geçiş yok." : "Durumu değiştirme yetkiniz yok."}</p>
            )}
            {q.outcome ? <p className="mt-3 text-sm">Sonuç: <strong>{OUTCOME_LABEL[q.outcome] ?? q.outcome}</strong></p> : null}
          </Card>

          {canManage ? (
            <Card title="Atama ve takip">
              <div className="grid gap-4 md:grid-cols-2">
                <ActionForm action={assignAction} className="space-y-3" aria-label="Sorumlu">
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="version" value={q.version} />
                  <Select name="assigneeId" label="Sorumlu" defaultValue={q.assignedTo?.id ?? ""}>
                    <option value="">Atanmamış</option>
                    {assignees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton size="sm" variant="secondary">
                    Kaydet
                  </SubmitButton>
                  <FormMessage />
                </ActionForm>
                <ActionForm action={followUpAction} className="space-y-3" aria-label="Takip tarihi">
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="version" value={q.version} />
                  <Input name="followUpAt" type="date" label="Takip tarihi" defaultValue={isoDay(q.followUpAt)} />
                  <SubmitButton size="sm" variant="secondary">
                    Kaydet
                  </SubmitButton>
                  <FormMessage />
                </ActionForm>
              </div>
            </Card>
          ) : null}

          <Card title="Bildirimler" description="Kayıtla aynı işlemde kuyruğa yazılır; sağlayıcı yokken gönderilmiş sayılmaz.">
            {outbox.length === 0 ? <p className="text-sm text-steel">Kayıt yok.</p> : null}
            <ul className="space-y-2 text-sm">
              {outbox.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {o.kind} · {o.channel}
                  </span>
                  <Badge tone={o.status === "SENT" ? "success" : "warning"}>{o.status === "BLOCKED" ? "Bekliyor — sağlayıcı yok" : o.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Talep edilen ürünler" description="Talep anındaki ad ve kaynak; fiyat içermez.">
            <DataTable
              caption="Talep edilen ürünler"
              rows={q.items}
              rowKey={(i) => i.id}
              empty="—"
              columns={[
                { key: "t", header: "Ürün (talep anındaki ad)", cell: (i) => (i.product ? <Link href={`/admin/products/${i.product.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{i.titleSnapshot}</Link> : i.titleSnapshot) },
                { key: "s", header: "Kaynak", cell: (i) => <code className="text-xs">{i.sourceKey}</code> },
                { key: "v", header: "Seçenek", cell: (i) => i.variantLabel ?? "—" },
                { key: "q", header: "Adet", align: "end", cell: (i) => i.quantity },
              ]}
            />
          </Card>
          <Card title="İç notlar" description="Yalnız ekip görür; müşteriye gösterilmez.">
            {canManage ? (
              <ActionForm action={addNoteAction} className="mb-4 space-y-2" aria-label="Not ekle" resetOnOk>
                <input type="hidden" name="id" value={q.id} />
                <Area name="body" label="Yeni not" rows={3} required />
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton size="sm">Not ekle</SubmitButton>
                  <FormMessage />
                </div>
              </ActionForm>
            ) : null}
            {q.notes.length === 0 ? <p className="text-sm text-steel">Not yok.</p> : null}
            <ul className="space-y-3">
              {q.notes.map((n) => (
                <li key={n.id} className="rounded-[var(--radius-md)] border border-line p-3 text-sm">
                  <p className="whitespace-pre-wrap text-ink">{n.body}</p>
                  <p className="mt-1 text-xs text-steel">
                    {n.author?.name ?? "—"} · {fmtDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Durum geçmişi">
            <ol className="space-y-2 text-sm">
              {q.events.map((e) => (
                <li key={e.id}>
                  <span className="text-steel">{fmtDateTime(e.createdAt)}</span> — {e.fromStatus ? `${STATUS_LABEL[e.fromStatus]} → ` : ""}
                  <strong>{STATUS_LABEL[e.toStatus]}</strong> · {actorName(e.actorId)}
                  {e.note ? <span className="block text-xs text-steel">“{e.note}”</span> : null}
                </li>
              ))}
            </ol>
          </Card>
          <Notice>Saklama süresi hukuken onaylanmadı: otomatik silme/anonimleştirme çalışmaz. Politika taslağı Ayarlar › Operasyon ekranında.</Notice>
        </div>
      </div>
    </>
  );
}
