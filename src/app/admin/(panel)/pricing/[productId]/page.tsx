import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Area, ConfirmSubmit, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, KeyValues } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { fmtDate, fmtDateTime } from "@/lib/admin/format";
import { livePrice } from "@/lib/admin/prices";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { commerceGate } from "@/lib/commerce/gate";
import { requireDb } from "@/lib/db";
import { discountPercent, formatMoney, toDecimalString } from "@/lib/money";
import { approvePriceAction, proposePriceAction, rejectPriceAction, revokePriceAction } from "../actions";

export const metadata = { title: "Ürün fiyatı" };
const EVENT_LABEL: Record<string, string> = { proposed: "Önerildi", approved: "Onaylandı", rejected: "Reddedildi", withdrawn: "Geri çekildi", revoked: "Geri alındı", superseded: "Yeni onayla sona erdi" };
type Evidence = { legacyPrice?: string; priceEqual?: boolean; legacyTitle?: string };

export default async function ProductPricePage({ params }: PageProps<"/admin/pricing/[productId]">) {
  const user = await requireAdmin("pricing");
  const { productId } = await params;
  const db = requireDb();
  const p = await db.product.findUnique({
    where: { id: productId },
    include: {
      translations: { where: { locale: "tr" }, select: { title: true } },
      prices: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } }, approvedBy: { select: { name: true } }, events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } } } },
      matchSuggestions: { select: { sourceLocale: true, sourceLegacyId: true, evidence: true } },
    },
  });
  if (!p) notFound();
  const canPropose = allowed(user.role, "price.propose");
  const canApprove = allowed(user.role, "price.approve");
  const live = livePrice(p.prices);
  const legacy = p.prices.filter((x) => x.source === "LEGACY_IMPORT");
  const admin = p.prices.filter((x) => x.source !== "LEGACY_IMPORT");
  const conflicts = p.matchSuggestions.filter((m) => (m.evidence as Evidence).priceEqual === false);
  const gate = commerceGate();
  const title = p.translations[0]?.title ?? "Ürün";
  const prefill = legacy[0] ? toDecimalString(legacy[0].amountMinor).replace(".", ",") : "";

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/pricing" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Fiyat merkezi
        </Link>
        <span className="mx-2 text-steel">·</span>
        <Link href={`/admin/products/${p.id}`} className="text-brand-700 hover:underline dark:text-brand-300">
          Ürünü düzenle
        </Link>
      </p>
      <PageHeader title={`Fiyat: ${title}`} description={`Eski site no #${p.sourceKey?.split(":").pop() ?? "—"}`} actions={live ? <Badge tone="success">Vitrinde: {formatMoney(live.amountMinor)}</Badge> : <Badge tone="warning">Vitrinde fiyat yok</Badge>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card title="Eski siteden gelen ham kayıt" description="Değiştirilmez ve doğrudan onaylanamaz; KDV durumu bilinmiyor.">
            {legacy.map((l) => (
              <KeyValues
                key={l.id}
                rows={[
                  ["Satış fiyatı (ham)", l.rawAmount ?? formatMoney(l.amountMinor)],
                  ["Eski fiyat (ham)", l.rawCompareAt ? <span className={l.compareAtMinor !== null && l.compareAtMinor <= l.amountMinor ? "text-signal" : ""}>{l.rawCompareAt}{l.compareAtMinor !== null && l.compareAtMinor <= l.amountMinor ? " — eski fiyat ≤ satış: indirim gösterilmez" : ""}</span> : "—"],
                  ["Para birimi / dil", `${l.currency} / ${l.sourceLocale?.toUpperCase() ?? "—"}`],
                  ["KDV", "Bilinmiyor"],
                  ["Kaydedildi", fmtDateTime(l.createdAt)],
                  ["Durum", <Badge key="s" tone="warning">{l.status}</Badge>],
                  ["Bayraklar", l.reviewReasons.join(", ") || "—"],
                ]}
              />
            ))}
            {conflicts.length ? (
              <Notice tone="warning" className="mt-4">
                Dil kayıtlarında farklı fiyat var:{" "}
                {conflicts.map((m) => `${m.sourceLocale.toUpperCase()} #${m.sourceLegacyId} → ${(m.evidence as Evidence).legacyPrice ? formatMoney(BigInt((m.evidence as Evidence).legacyPrice!.replace(".", ""))) : "?"}`).join(" · ")}. Sistem bunları tek fiyata otomatik çevirmez; ürünün gerçek ticari fiyatını müşteriyle netleştirin.
              </Notice>
            ) : null}
          </Card>

          <Card title="Fiyat önerileri ve geçmiş" description="Her satır kalıcıdır; karar geçmişi aşağıda.">
            {admin.length === 0 ? <p className="text-sm text-steel">Henüz yönetici fiyat önerisi yok.</p> : null}
            <ol className="space-y-4">
              {admin.map((x) => {
                const pct = discountPercent(x.amountMinor, x.compareAtMinor);
                const isLive = live?.id === x.id;
                return (
                  <li key={x.id} className="rounded-[var(--radius-md)] border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-lg font-bold text-ink tabular-nums">
                        {formatMoney(x.amountMinor)} <span className="text-sm font-medium text-steel">{x.vatIncluded === null ? "KDV ?" : x.vatIncluded ? "KDV dahil" : "KDV hariç"} · %{((x.vatRateBp ?? 0) / 100).toLocaleString("tr-TR")}</span>
                      </p>
                      <div className="flex gap-1">
                        {x.status === "VERIFIED" ? <Badge tone="success">{isLive ? "Onaylı · vitrinde" : "Onaylı (süresi dışında)"}</Badge> : x.status === "REJECTED" ? <Badge tone="outline">Reddedildi / geri alındı</Badge> : <Badge tone="brand">Onay bekliyor</Badge>}
                      </div>
                    </div>
                    <KeyValues
                      rows={[
                        ["Eski fiyat", x.compareAtMinor !== null ? `${formatMoney(x.compareAtMinor)}${pct ? ` (−%${pct})` : ""}` : "—"],
                        ["Geçerlilik", `${fmtDate(x.validFrom)} → ${x.validTo ? fmtDate(x.validTo) : "süresiz"}`],
                        ["Kaynak", x.evidence ?? "—"],
                        ["Öneren", `${x.createdBy?.name ?? "—"} · ${fmtDateTime(x.createdAt)}`],
                        ["Onaylayan", x.approvedBy ? `${x.approvedBy.name} · ${fmtDateTime(x.approvedAt)}` : "—"],
                        ...(x.note ? ([["Not", x.note]] as [string, string][]) : []),
                      ]}
                    />
                    {x.events.length ? (
                      <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-steel">
                        {x.events.map((e) => (
                          <li key={e.id}>
                            {fmtDateTime(e.createdAt)} — <strong className="text-ink">{EVENT_LABEL[e.action] ?? e.action}</strong> · {e.actor?.name ?? "—"}
                            {e.note ? ` · “${e.note}”` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {x.status === "UNVERIFIED" && (canApprove || x.createdById === user.id) ? (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {canApprove && x.createdById !== user.id ? (
                          <ActionForm action={approvePriceAction} className="space-y-2 rounded-[var(--radius-md)] bg-success-50/50 p-3" aria-label="Onayla">
                            <input type="hidden" name="priceId" value={x.id} />
                            <Input name="note" label="Onay notu (isteğe bağlı)" />
                            <ConfirmSubmit variant="primary" confirmText="Onayla — vitrinde gösterilecek">
                              Onayla
                            </ConfirmSubmit>
                            <FormMessage />
                          </ActionForm>
                        ) : canApprove ? (
                          <p className="rounded-[var(--radius-md)] bg-surface-2 p-3 text-xs text-steel">Bu öneriyi siz girdiniz; dört göz kuralı gereği başka bir yetkili onaylamalı.</p>
                        ) : null}
                        <ActionForm action={rejectPriceAction} className="space-y-2 rounded-[var(--radius-md)] bg-surface-2 p-3" aria-label="Reddet">
                          <input type="hidden" name="priceId" value={x.id} />
                          <Input name="note" label={x.createdById === user.id && !canApprove ? "Geri çekme gerekçesi" : "Ret gerekçesi"} required />
                          <ConfirmSubmit>{x.createdById === user.id && !canApprove ? "Geri çek" : "Reddet"}</ConfirmSubmit>
                          <FormMessage />
                        </ActionForm>
                      </div>
                    ) : null}
                    {isLive && canApprove ? (
                      <ActionForm action={revokePriceAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] bg-surface-2 p-3" aria-label="Geri al">
                        <input type="hidden" name="priceId" value={x.id} />
                        <Input name="note" label="Geri alma gerekçesi" required />
                        <ConfirmSubmit>Onayı geri al</ConfirmSubmit>
                        <FormMessage className="w-full" />
                      </ActionForm>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          {canPropose ? (
            <Card title="Yeni fiyat önerisi" description="Müşteriden alınan doğrulanmış bilgiyle girin.">
              <ActionForm action={proposePriceAction} className="space-y-4" aria-label="Fiyat önerisi" resetOnOk>
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="currency" value="TRY" />
                <Input name="amount" label="Satış fiyatı (TL)" defaultValue={prefill} required hint="Örn. 1.250.000,00 — ham eski fiyat ön doldurulmuştur, kontrol edin." inputMode="decimal" />
                <Input name="compareAt" label="Eski fiyat (isteğe bağlı)" hint="Yalnız gerçek indirimde ve satış fiyatından yüksekse." inputMode="decimal" />
                <Select name="vatMode" label="KDV" required defaultValue="">
                  <option value="" disabled>
                    Seçin
                  </option>
                  <option value="included">Fiyata KDV dahil</option>
                  <option value="excluded">Fiyata KDV hariç</option>
                </Select>
                <Input name="vatRate" label="KDV oranı (%)" required inputMode="decimal" placeholder="20" />
                <div className="grid grid-cols-2 gap-3">
                  <Input name="validFrom" type="date" label="Geçerlilik başlangıcı" />
                  <Input name="validTo" type="date" label="Bitiş (isteğe bağlı)" />
                </div>
                <Input name="evidence" label="Fiyatın kaynağı" required placeholder="Müşteri fiyat listesi, 2026-11 (e-posta)" />
                <Area name="note" label="Not" rows={2} />
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton pendingText="Kaydediliyor…">Öneriyi kaydet</SubmitButton>
                  <FormMessage />
                </div>
              </ActionForm>
            </Card>
          ) : null}
          <Card title="Online satış kapısı" description="Fiyat onayından bağımsızdır; yalnız sunucu ayarlarıyla ve tüm ön koşullarla açılır.">
            <p className="mb-2 text-sm font-semibold text-signal">{gate.enabled ? "Açık" : "Kapalı"}</p>
            <ul className="list-disc space-y-1 ps-5 text-xs text-steel">
              {gate.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
