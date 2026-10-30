import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ActionForm, Area, Check, ConfirmSubmit, FormMessage, Input, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, KeyValues } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { matchRequirements } from "@/lib/admin/translations";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { approveMatchAction, rejectMatchAction, rematchAction, reopenMatchAction } from "../../actions";

export const metadata = { title: "Eşleşme karşılaştırma" };
type Evidence = { legacyTitle?: string; trTitle?: string; legacyUrl?: string; legacyPrice?: string; trPrice?: string; sharedImages?: number; legacyImages?: number; trImages?: number; priceEqual?: boolean; rematchedFrom?: string };
type Payload = { title?: string; slug?: string; short_desc?: string; description_text?: string; images?: string[]; source_url?: string; price_raw?: string };
const dec = (v?: string) => (v ? formatMoney(BigInt(v.replace(".", ""))) : "—");
const localImg = (u: string) => {
  try {
    return `/upload/${new URL(u).pathname.replace(/^\/upload\//, "").split("/").map((s) => encodeURIComponent(decodeURIComponent(s))).join("/")}`;
  } catch {
    return null;
  }
};

/** Side-by-side comparison of a legacy EN/FR record and the suggested Turkish product, with the decision forms. */
export default async function MatchDetail({ params }: PageProps<"/admin/translations/matches/[id]">) {
  const user = await requireAdmin("translations");
  const { id } = await params;
  const db = requireDb();
  const m = await db.legacyMatchSuggestion.findUnique({ where: { id }, include: { product: { include: { translations: true, media: { orderBy: { sortOrder: "asc" }, take: 4, include: { media: { select: { publicPath: true } } } } } } } });
  if (!m) notFound();
  const rec = await db.legacySourceRecord.findUnique({ where: { entityType_legacyId_locale: { entityType: "product", legacyId: m.sourceLegacyId, locale: m.sourceLocale } } });
  const p = (rec?.payload ?? {}) as Payload;
  const e = m.evidence as Evidence;
  const req = matchRequirements(m);
  const tr = m.product.translations.find((t) => t.locale === "tr");
  const existing = m.product.translations.find((t) => t.locale === m.sourceLocale);
  const canDecide = allowed(user.role, "translation.decide");
  const decider = m.decidedById ? await db.user.findUnique({ where: { id: m.decidedById }, select: { name: true } }) : null;
  const candidates = canDecide && m.status !== "APPROVED" ? await db.product.findMany({ where: { id: { not: m.productId }, translations: { none: { locale: m.sourceLocale } } }, orderBy: { sortOrder: "asc" }, select: { id: true, sourceKey: true, translations: { where: { locale: "tr" }, select: { title: true } } } }) : [];
  const legacyImages = (p.images ?? []).slice(0, 4).map(localImg).filter((x): x is string => !!x);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/translations/matches" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Eşleşme önerileri
        </Link>
      </p>
      <PageHeader title={`${m.sourceLocale.toUpperCase()} #${m.sourceLegacyId} ↔ TR ürün`} description={`Yöntem: ${m.method} · güven ${m.confidence}/100`} actions={<Badge tone={m.status === "APPROVED" ? "success" : m.status === "REJECTED" ? "outline" : "brand"}>{m.status === "SUGGESTED" ? "Karar bekliyor" : m.status === "APPROVED" ? "Onaylandı" : "Reddedildi"}</Badge>} />
      {req.lowConfidence || req.customerDecision || req.priceConflict ? (
        <div className="mb-6 space-y-2">
          {req.customerDecision ? (
            <Notice tone="warning">
              <AlertTriangle aria-hidden="true" className="me-1 inline size-4" /> Müşteri kararı gerekli: bu ilişki veri kalitesi raporunda açık soru olarak duruyor. Onay için müşteri onayının referansı istenir.
            </Notice>
          ) : null}
          {req.lowConfidence ? <Notice tone="warning">Düşük güven ({m.confidence}): yalnız sıra eşleşmesi; görsel/fiyat kanıtı zayıf. Yanlış eşleşme olabilir.</Notice> : null}
          {req.priceConflict ? <Notice>Fiyatlar farklı ({dec(e.legacyPrice)} ≠ {dec(e.trPrice)}). Onaylansa bile EN/FR fiyatı alınmaz; Türkçe fiyat tek kaynak ve onaysız kalır.</Notice> : null}
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Eski ${m.sourceLocale.toUpperCase()} kaydı`} description="kornne.com'dan salt-okunur alınmış metin">
          <div lang={m.sourceLocale} className="space-y-4">
            <KeyValues rows={[["Başlık", p.title ?? e.legacyTitle], ["Eski adres", p.source_url ? <a key="u" href={p.source_url} target="_blank" rel="noopener noreferrer" className="break-all text-brand-700 underline dark:text-brand-300">{new URL(p.source_url).pathname}</a> : "—"], ["Kısa açıklama", p.short_desc ?? "—"], ["Ham fiyat", p.price_raw ?? "—"], ["Görsel", `${e.legacyImages ?? 0} (TR ile ortak ${e.sharedImages ?? 0})`]]} />
            <div className="grid grid-cols-4 gap-2">
              {legacyImages.map((src) => (
                <div key={src} className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-surface-2">
                  <Image src={src} alt="" fill sizes="120px" className="object-contain" />
                </div>
              ))}
            </div>
            <p className="line-clamp-6 text-sm text-steel">{p.description_text || "Açıklama yok."}</p>
          </div>
        </Card>
        <Card title="Önerilen Türkçe ürün" actions={<Link href={`/admin/products/${m.productId}`} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">Ürüne git →</Link>}>
          <div className="space-y-4">
            <KeyValues rows={[["Başlık", tr?.title], ["Adres", tr ? `/urun/${tr.slug}` : "—"], ["Eski site no", `#${m.product.sourceKey?.split(":").pop() ?? "—"}`], ["Ham fiyat", dec(e.trPrice)], ["Mevcut dil sürümü", existing ? `${existing.status} (${existing.slug})` : "Yok"]]} />
            <div className="grid grid-cols-4 gap-2">
              {m.product.media.map((pm) => (
                <div key={pm.mediaId} className="relative aspect-square overflow-hidden rounded-[var(--radius-sm)] bg-surface-2">
                  <Image src={`/upload/${pm.media.publicPath.replace(/^\/upload\//, "").split("/").map(encodeURIComponent).join("/")}`} alt="" fill sizes="120px" className="object-contain" />
                </div>
              ))}
            </div>
            {e.rematchedFrom ? <p className="text-xs text-steel">Elle yeniden eşleştirildi.</p> : null}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {m.status === "SUGGESTED" && canDecide ? (
          <>
            <Card title="Onayla" description="Eski metinden bu dil için yayında OLMAYAN bir editör taslağı oluşturur. Yayın, ürünün Diller sekmesinden ayrıca yapılır.">
              <ActionForm action={approveMatchAction} className="space-y-3" aria-label="Eşleşmeyi onayla">
                <input type="hidden" name="id" value={m.id} />
                {req.lowConfidence ? <Check name="confirmLowConfidence" label="Görselleri ve metni karşılaştırdım; bu kayıt gerçekten bu ürünün çevirisi." /> : null}
                <Area name="note" label={req.lowConfidence ? "Gerekçe (zorunlu, en az 10 karakter)" : "Not (isteğe bağlı)"} rows={2} />
                {req.customerDecision ? <Input name="customerApprovalRef" label="Müşteri onayı referansı" placeholder="Kim, ne zaman, hangi yazışma" required /> : null}
                <ConfirmSubmit variant="primary" confirmText="Onayla — taslak oluştur">
                  Onayla
                </ConfirmSubmit>
                <FormMessage />
              </ActionForm>
            </Card>
            <Card title="Reddet veya yeniden eşleştir">
              <ActionForm action={rejectMatchAction} className="mb-6 space-y-3" aria-label="Eşleşmeyi reddet">
                <input type="hidden" name="id" value={m.id} />
                <Area name="note" label="Ret gerekçesi" rows={2} />
                <ConfirmSubmit>Reddet</ConfirmSubmit>
                <FormMessage />
              </ActionForm>
              <ActionForm action={rematchAction} className="space-y-3 border-t border-line pt-4" aria-label="Yeniden eşleştir">
                <input type="hidden" name="id" value={m.id} />
                <Select name="productId" label="Doğru Türkçe ürün" defaultValue="" required>
                  <option value="" disabled>
                    Seçin
                  </option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.translations[0]?.title} (#{c.sourceKey?.split(":").pop() ?? "yeni"})
                    </option>
                  ))}
                </Select>
                <Area name="note" label="Gerekçe" rows={2} required />
                <SubmitButton variant="secondary">Yeniden eşleştir</SubmitButton>
                <FormMessage />
              </ActionForm>
            </Card>
          </>
        ) : (
          <Card title="Karar">
            <KeyValues rows={[["Durum", m.status], ["Karar veren", decider?.name ?? "—"], ["Tarih", fmtDateTime(m.decidedAt)], ["Not", m.note ?? "—"]]} />
            {m.status === "REJECTED" && canDecide ? (
              <ActionForm action={reopenMatchAction} className="mt-4 flex items-center gap-3">
                <input type="hidden" name="id" value={m.id} />
                <SubmitButton variant="secondary" size="sm">
                  Yeniden incelemeye aç
                </SubmitButton>
                <FormMessage />
              </ActionForm>
            ) : null}
            {m.status === "APPROVED" ? (
              <p className="mt-4 text-sm">
                Taslak oluşturuldu. Yayın:{" "}
                <Link href={`/admin/products/${m.productId}?tab=diller`} className="font-semibold text-brand-700 underline dark:text-brand-300">
                  ürünün Diller sekmesi
                </Link>
              </p>
            ) : null}
          </Card>
        )}
      </div>
    </>
  );
}
