import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Eye } from "lucide-react";
import { ActionForm, Area, Check, ConfirmSubmit, FormMessage, Input, LengthHint, Select, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { Card, KeyValues, Tabs } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Notice } from "@/components/ui/States";
import { fmtDateTime } from "@/lib/admin/format";
import { livePrice } from "@/lib/admin/prices";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { dirOf, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/routes";
import { formatMoney } from "@/lib/money";
import { publishTranslationAction, unpublishTranslationAction } from "../../translations/actions";
import { deleteSpecAction, saveCategoriesAction, saveMetaAction, saveRelatedAction, saveSpecAction, saveTranslationAction, setDocumentStatusAction, uploadDocumentAction, uploadProductImageAction, verifySpecAction } from "../actions";
import { MediaOrderEditor, VariantsEditor } from "./editors";

export const metadata = { title: "Ürün düzenle" };
const TABS = [
  ["icerik", "İçerik ve durum"],
  ["diller", "Diller"],
  ["kategoriler", "Kategori ve ilişkiler"],
  ["secenekler", "Seçenekler"],
  ["gorseller", "Görseller"],
  ["teknik", "Teknik bilgi ve doküman"],
  ["gecmis", "Geçmiş"],
] as const;
const PUBLIC_T = new Set(["LEGACY_SOURCE", "APPROVED"]);
const T_LABEL: Record<string, string> = { LEGACY_SOURCE: "Eski site metni (yayında)", APPROVED: "Yayında", IN_REVIEW: "İncelemede (yayında değil)", DRAFT: "Taslak", MACHINE_DRAFT: "Makine taslağı", MISSING: "Eksik" };

export default async function ProductEditPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  const user = await requireAdmin("products");
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "icerik") as (typeof TABS)[number][0];
  const db = requireDb();
  const p = await db.product.findUnique({
    where: { id },
    include: {
      translations: true,
      categories: { include: { category: { include: { translations: { where: { locale: "tr" } } } } } },
      related: { select: { toId: true } },
      variants: { orderBy: { sortOrder: "asc" } },
      media: { orderBy: { sortOrder: "asc" }, include: { media: { include: { translations: true } } } },
      specs: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { sortOrder: "asc" } },
      prices: { orderBy: { createdAt: "desc" } },
      matchSuggestions: { select: { id: true, sourceLocale: true, sourceLegacyId: true, status: true, confidence: true } },
    },
  });
  if (!p) notFound();
  const tr = p.translations.find((t) => t.locale === "tr");
  const can = (a: Parameters<typeof allowed>[1]) => allowed(user.role, a);
  const token = p.updatedAt.toISOString();
  const live = livePrice(p.prices);
  const legacyId = p.sourceKey?.split(":").pop();
  const visible = p.status === "PUBLISHED" && !p.needsReview;

  const head = (
    <PageHeader
      title={tr?.title ?? "Ürün"}
      description={`${legacyId ? `Eski site no #${legacyId}` : "Yeni ürün"}${p.sku ? ` · SKU ${p.sku}` : ""} · son güncelleme ${fmtDateTime(p.updatedAt)}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {p.needsReview ? <Badge tone="warning">İncelemede</Badge> : visible ? <Badge tone="success">Vitrinde</Badge> : <Badge tone="neutral">{p.status === "ARCHIVED" ? "Arşiv" : "Taslak"}</Badge>}
          <Link href={`/admin/products/${p.id}/preview`} className={buttonClass("secondary", "sm")}>
            <Eye aria-hidden="true" className="size-4" /> Önizle
          </Link>
          {visible && tr ? (
            <a href={localizePath("tr", `/urun/${tr.slug}`)} target="_blank" rel="noopener" className={buttonClass("outline", "sm")}>
              <ExternalLink aria-hidden="true" className="size-4" /> Vitrinde aç
            </a>
          ) : null}
        </div>
      }
    />
  );

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/products" className="text-brand-700 hover:underline dark:text-brand-300">
          ← Ürünler
        </Link>
      </p>
      {head}
      {sp.created ? <Notice className="mb-6">Ürün taslak olarak oluşturuldu. İçeriği tamamlayıp kategoriyi kontrol edin; yayınlamak için durumunu “Yayında” yapın.</Notice> : null}
      <Tabs label="Ürün bölümleri" current={tab} items={TABS.map(([k, l]) => ({ key: k, label: l, href: `/admin/products/${p.id}?tab=${k}` }))} />

      {tab === "icerik" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <Card title="Türkçe içerik" description="Türkçe kaynak dildir. Yayındaki üründe kayıt anında vitrine yansır; adres değişirse eski adres 301 ile yönlenir.">
            {tr ? (
              <ActionForm action={saveTranslationAction} className="space-y-5" aria-label="Türkçe içerik">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="locale" value="tr" />
                <input type="hidden" name="expectedUpdatedAt" value={token} />
                <Input name="title" label="Ürün adı" defaultValue={tr.title} required disabled={!can("product.edit")} />
                <Input name="slug" label="Adres (slug)" defaultValue={tr.slug} required hint={`Vitrin adresi: /urun/${tr.slug}`} disabled={!can("product.edit")} />
                <Area name="shortDescription" label="Kısa açıklama" defaultValue={tr.shortDescription ?? ""} rows={2} hint="Listelerde ve paylaşımlarda kullanılır (en fazla 500 karakter)." disabled={!can("product.edit")} />
                <RichTextEditor name="descriptionHtml" label="Ürün açıklaması" defaultValue={tr.descriptionHtml ?? ""} hint="Yalnız gerçek ürün bilgisi. Kaydederken HTML güvenlik filtresinden geçer." />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <Input id="seo-title-tr" name="seoTitle" label="SEO başlığı" defaultValue={tr.seoTitle ?? ""} hint="Boşsa ürün adı kullanılır." />
                    <LengthHint forId="seo-title-tr" min={30} max={60} />
                  </div>
                  <div className="space-y-1">
                    <Area id="seo-desc-tr" name="seoDescription" label="SEO açıklaması" defaultValue={tr.seoDescription ?? ""} rows={3} />
                    <LengthHint forId="seo-desc-tr" min={70} max={160} />
                  </div>
                </div>
                <p className="text-xs text-steel">Durum: {T_LABEL[tr.status] ?? tr.status}. Düzenlenen eski site metni “Yayında (düzenlendi)” olur; içe aktarma bu satırın üzerine yazmaz.</p>
                {can("product.edit") ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <SubmitButton pendingText="Kaydediliyor…">Kaydet</SubmitButton>
                    <FormMessage />
                  </div>
                ) : null}
              </ActionForm>
            ) : (
              <Notice tone="warning">Türkçe kayıt yok.</Notice>
            )}
          </Card>

          <div className="space-y-6">
            <Card title="Yayın ve kimlik">
              <ActionForm action={saveMetaAction} className="space-y-4" aria-label="Yayın durumu">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="expectedUpdatedAt" value={token} />
                <Select name="status" label="Yayın durumu" defaultValue={p.status} disabled={!can("product.edit")}>
                  <option value="DRAFT">Taslak (vitrinde yok)</option>
                  <option value="PUBLISHED">Yayında</option>
                  <option value="ARCHIVED">Arşiv</option>
                </Select>
                {p.needsReview ? (
                  <div className="space-y-3 rounded-[var(--radius-md)] border border-warning/40 bg-warning-50 p-3">
                    <p className="text-sm text-ink">
                      <strong>İncelemede:</strong> {p.reviewReasons.join(", ") || "veri kararı bekliyor"}. Eski URL geçici (307) yönlenir.
                    </p>
                    {can("product.review_clear") ? (
                      <>
                        <Check name="releaseHold" label="İncelemeyi tamamla ve yayına izin ver" hint="Müşteri kararı alındıysa işaretleyin." />
                        <Area name="releaseReason" label="Gerekçe / müşteri kararı" rows={2} />
                      </>
                    ) : (
                      <p className="text-xs text-steel">Bu ürünü yalnız Yönetici / Süper Yönetici serbest bırakabilir.</p>
                    )}
                  </div>
                ) : null}
                <Input name="sku" label="SKU (doğrulanmış)" defaultValue={p.sku ?? ""} hint="Yalnız gerçek stok kodu. Eski site no değiştirilemez." disabled={!can("product.edit")} />
                <Input name="sortOrder" type="number" label="Vitrin sırası" defaultValue={String(p.sortOrder)} disabled={!can("product.edit")} />
                {can("product.edit") ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <SubmitButton pendingText="Kaydediliyor…">Kaydet</SubmitButton>
                    <FormMessage className="w-full" />
                  </div>
                ) : null}
              </ActionForm>
            </Card>
            <Card title="Fiyat" actions={<Link href={`/admin/pricing/${p.id}`} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">Fiyat merkezi →</Link>}>
              <KeyValues
                rows={[
                  ["Vitrindeki fiyat", live ? `${formatMoney(live.amountMinor)} (${live.vatIncluded ? "KDV dahil" : "KDV hariç"})` : "Fiyat için teklif alın"],
                  ["Eski site ham fiyatı", p.prices.find((x) => x.source === "LEGACY_IMPORT")?.rawAmount ?? "—"],
                  ["Onay bekleyen öneri", p.prices.filter((x) => x.source === "ADMIN" && x.status === "UNVERIFIED").length],
                ]}
              />
              <p className="mt-3 text-xs text-steel">Onaylı fiyat yalnız gösterimi değiştirir; online satış ayrıca tüm ticari onaylar tamamlanınca açılır.</p>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "diller" ? <LanguagesTab product={p} canEdit={can("product.edit") || can("translation.publish")} canPublish={can("translation.publish")} token={token} /> : null}

      {tab === "kategoriler" ? <CategoriesTab productId={p.id} token={token} selected={p.categories} related={p.related.map((r) => r.toId)} canEdit={can("product.edit")} /> : null}

      {tab === "secenekler" ? (
        <Card title="Seçenekler (varyantlar)" description={p.variants.length ? `${p.variants.filter((v) => v.active).length} aktif seçenek — vitrinde seçim zorunlu.` : "Bu ürünün seçeneği yok."}>
          <VariantsEditor
            productId={p.id}
            disabled={!can("product.edit")}
            initial={p.variants.map((v) => {
              const l = v.labels as Record<string, string>;
              return { key: v.id, id: v.id, tr: l.tr ?? "", en: l.en ?? "", fr: l.fr ?? "", ru: l.ru ?? "", ar: l.ar ?? "", active: v.active, sortOrder: v.sortOrder, sourceKey: v.sourceKey };
            })}
          />
          <p className="mt-3 text-xs text-steel">Seçenek bazında fiyat bu sprintte yok; fiyat ürün düzeyinde onaylanır.</p>
        </Card>
      ) : null}

      {tab === "gorseller" ? <ImagesTab product={p} canEdit={can("media.edit")} canUpload={can("media.upload")} /> : null}

      {tab === "teknik" ? <TechTab product={p} canEdit={can("product.edit")} canVerify={can("spec.verify")} canDocs={can("document.manage")} /> : null}

      {tab === "gecmis" ? <HistoryTab productId={p.id} /> : null}
    </>
  );
}

type P = NonNullable<Awaited<ReturnType<ReturnType<typeof requireDb>["product"]["findUnique"]>>> & {
  translations: { id: string; locale: string; title: string; slug: string; shortDescription: string | null; descriptionHtml: string | null; seoTitle: string | null; seoDescription: string | null; status: string; legacyRecordId: string | null }[];
};

async function LanguagesTab({ product, canEdit, canPublish, token }: { product: P & { matchSuggestions: { id: string; sourceLocale: string; sourceLegacyId: string; status: string; confidence: number }[] }; canEdit: boolean; canPublish: boolean; token: string }) {
  const others = (["en", "fr", "ru", "ar"] as Locale[]).map((l) => ({ locale: l, t: product.translations.find((x) => x.locale === l) }));
  return (
    <div className="space-y-6">
      <Notice>
        EN/FR sürümleri yalnız <Link href="/admin/translations/matches" className="font-semibold underline">eşleşme onayı</Link> ile eski site metninden taslak olarak gelir, ardından burada ayrıca yayınlanır. RU/AR için kaynakta ürün metni yok: gerçek çeviri sağlanmadan sayfa oluşturulmaz, dil menüsü bu ürün için o dili göstermez.
      </Notice>
      {others.map(({ locale, t }) => {
        const match = product.matchSuggestions.find((m) => m.sourceLocale === locale);
        return (
          <Card
            key={locale}
            title={`${LOCALE_META[locale].nativeName} (${locale.toUpperCase()})`}
            description={t ? T_LABEL[t.status] ?? t.status : match ? `Eşleşme önerisi: ${match.status} (#${match.sourceLegacyId}, güven ${match.confidence})` : "Bu dilde sürüm yok."}
            actions={
              t && canPublish ? (
                PUBLIC_T.has(t.status) ? (
                  <ActionForm key={`unpublish-${locale}`} action={unpublishTranslationAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <ConfirmSubmit>Yayından kaldır</ConfirmSubmit>
                    <FormMessage />
                  </ActionForm>
                ) : (
                  <ActionForm key={`publish-${locale}`} action={publishTranslationAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <SubmitButton size="sm" pendingText="Yayınlanıyor…">Bu dili yayınla</SubmitButton>
                    <FormMessage />
                  </ActionForm>
                )
              ) : null
            }
          >
            {t ? (
              <ActionForm action={saveTranslationAction} className="space-y-4" aria-label={`${locale} içerik`}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="expectedUpdatedAt" value={token} />
                <div className="grid gap-4 md:grid-cols-2" lang={locale} dir={dirOf(locale)}>
                  <Input name="title" label="Ürün adı" defaultValue={t.title} required />
                  <Input name="slug" label="Adres (slug)" defaultValue={t.slug} required dir="ltr" hint={`/${locale}/${locale === "fr" ? "produit" : locale === "ru" ? "produkt" : "product"}/${t.slug}`} />
                </div>
                <div lang={locale} dir={dirOf(locale)}>
                  <RichTextEditor name="descriptionHtml" label="Açıklama" defaultValue={t.descriptionHtml ?? ""} minHeight="10rem" />
                </div>
                <div className="grid gap-4 md:grid-cols-2" lang={locale} dir={dirOf(locale)}>
                  <div className="space-y-1">
                    <Input id={`seo-title-${locale}`} name="seoTitle" label="SEO başlığı" defaultValue={t.seoTitle ?? ""} />
                    <LengthHint forId={`seo-title-${locale}`} min={30} max={60} />
                  </div>
                  <div className="space-y-1">
                    <Area id={`seo-desc-${locale}`} name="seoDescription" label="SEO açıklaması" defaultValue={t.seoDescription ?? ""} rows={3} />
                    <LengthHint forId={`seo-desc-${locale}`} min={70} max={160} />
                  </div>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <SubmitButton pendingText="Kaydediliyor…">Kaydet</SubmitButton>
                    <FormMessage />
                  </div>
                ) : null}
              </ActionForm>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

async function CategoriesTab({ productId, token, selected, related, canEdit }: { productId: string; token: string; selected: { categoryId: string; isPrimary: boolean }[]; related: string[]; canEdit: boolean }) {
  const db = requireDb();
  const [categories, products] = await Promise.all([
    db.category.findMany({ where: { isAllProducts: false }, orderBy: { sortOrder: "asc" }, include: { translations: { where: { locale: "tr" } } } }),
    db.product.findMany({ where: { id: { not: productId }, status: { not: "ARCHIVED" } }, orderBy: { sortOrder: "asc" }, select: { id: true, sourceKey: true, translations: { where: { locale: "tr" }, select: { title: true } } } }),
  ]);
  const primary = selected.find((s) => s.isPrimary)?.categoryId ?? selected[0]?.categoryId;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Kategoriler" description="“Tüm Ürünler” sanal listedir, otomatik hesaplanır.">
        <ActionForm action={saveCategoriesAction} className="space-y-3" aria-label="Kategoriler">
          <input type="hidden" name="id" value={productId} />
          <input type="hidden" name="expectedUpdatedAt" value={token} />
          <fieldset className="space-y-2">
            <legend className="sr-only">Kategoriler</legend>
            {categories.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3">
                <label className="flex min-h-10 items-center gap-3 text-sm font-medium">
                  <input type="checkbox" name="categoryIds" value={c.id} defaultChecked={selected.some((s) => s.categoryId === c.id)} className="size-5 accent-brand-700" />
                  {c.translations[0]?.name ?? c.key}
                </label>
                <label className="flex min-h-10 items-center gap-2 text-xs text-steel">
                  <input type="radio" name="primaryId" value={c.id} defaultChecked={primary === c.id} className="size-4 accent-brand-700" /> Birincil
                </label>
              </div>
            ))}
          </fieldset>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="Kaydediliyor…">Kategorileri kaydet</SubmitButton>
              <FormMessage />
            </div>
          ) : null}
        </ActionForm>
      </Card>
      <Card title="İlgili ürünler" description="Seçilmezse vitrinde aynı birincil kategoriden ürünler gösterilir. En fazla 8.">
        <ActionForm action={saveRelatedAction} className="space-y-3" aria-label="İlgili ürünler">
          <input type="hidden" name="id" value={productId} />
          <div className="max-h-96 space-y-1 overflow-y-auto rounded-[var(--radius-md)] border border-line p-2">
            {products.map((o) => (
              <label key={o.id} className="flex min-h-10 items-center gap-3 rounded-[var(--radius-sm)] px-2 text-sm hover:bg-surface-2">
                <input type="checkbox" name="relatedIds" value={o.id} defaultChecked={related.includes(o.id)} className="size-5 accent-brand-700" />
                <span className="flex-1">{o.translations[0]?.title}</span>
                <span className="text-xs text-steel tabular-nums">#{o.sourceKey?.split(":").pop() ?? "yeni"}</span>
              </label>
            ))}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="Kaydediliyor…">İlgili ürünleri kaydet</SubmitButton>
              <FormMessage />
            </div>
          ) : null}
        </ActionForm>
      </Card>
    </div>
  );
}

async function ImagesTab({ product, canEdit, canUpload }: { product: P & { media: { mediaId: string; isPrimary: boolean; media: { id: string; publicPath: string; width: number | null; height: number | null; translations: { locale: string; alt: string }[] } }[] }; canEdit: boolean; canUpload: boolean }) {
  const library = await requireDb().mediaAsset.findMany({ where: { products: { none: { productId: product.id } } }, orderBy: { publicPath: "asc" }, select: { id: true, publicPath: true, translations: { where: { locale: "tr" }, select: { alt: true } } } });
  const src = (p: string) => `/upload/${p.replace(/^\/upload\//, "").split("/").map(encodeURIComponent).join("/")}`;
  return (
    <div className="space-y-6">
      <Card title="Ürün görselleri" description="Sıralama, ana görsel ve bağlantı. Orijinal dosyalar değiştirilmez; ayrılan görselin eski /upload adresi çalışmaya devam eder. Alt metinleri Medya kütüphanesinden düzenleyin.">
        <MediaOrderEditor
          productId={product.id}
          disabled={!canEdit}
          initial={product.media.map((m) => ({ id: m.mediaId, src: src(m.media.publicPath), alt: m.media.translations.find((t) => t.locale === "tr")?.alt ?? "", width: m.media.width, height: m.media.height, isPrimary: m.isPrimary, small: (m.media.width ?? 0) < 500 || (m.media.height ?? 0) < 500 }))}
          library={library.map((l) => ({ id: l.id, label: `${l.publicPath.replace("/upload/", "")}${l.translations[0] ? ` — ${l.translations[0].alt}` : ""}` }))}
        />
      </Card>
      {canUpload ? (
        <Card title="Yeni görsel yükle" description="JPEG, PNG, WebP veya GIF · en fazla 10 MB · içerik kontrol edilir (uzantıya güvenilmez) · aynı dosya ikinci kez saklanmaz.">
          <ActionForm action={uploadProductImageAction} className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end" aria-label="Görsel yükle" resetOnOk>
            <input type="hidden" name="productId" value={product.id} />
            <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
              Dosya
              <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required className="w-full min-w-0 min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface p-2 text-sm font-normal" />
            </label>
            <Input name="alt" label="Alt metin (Türkçe)" required hint="Görselde ne olduğunu anlatın." />
            <SubmitButton pendingText="Yükleniyor…">Yükle ve bağla</SubmitButton>
            <FormMessage className="md:col-span-3" />
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

async function TechTab({ product, canEdit, canVerify, canDocs }: { product: P & { specs: { id: string; key: string; labels: unknown; values: unknown; unit: string | null; sortOrder: number; status: string; source: string | null }[]; documents: { id: string; title: string; publicPath: string; bytes: number; status: string; locale: string | null; createdAt: Date }[] }; canEdit: boolean; canVerify: boolean; canDocs: boolean }) {
  const lbl = (j: unknown) => (j as Record<string, string>)?.tr ?? "";
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Teknik özellikler" description="Vitrinde yalnız kaynağıyla doğrulanan satırlar görünür. Değerini değiştirdiğiniz özellik yeniden doğrulama ister.">
        <ul className="space-y-3">
          {product.specs.map((s) => (
            <li key={s.id} className="rounded-[var(--radius-md)] border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <code className="text-xs text-steel">{s.key}</code>
                {s.status === "VERIFIED" ? <Badge tone="success">Doğrulandı</Badge> : <Badge tone="warning">Doğrulanmadı</Badge>}
                {s.source ? <span className="text-xs text-steel">Kaynak: {s.source}</span> : null}
              </div>
              <ActionForm action={saveSpecAction} className="grid gap-3 sm:grid-cols-2" aria-label={`Özellik ${s.key}`}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="specId" value={s.id} />
                <input type="hidden" name="key" value={s.key} />
                <input type="hidden" name="sortOrder" value={s.sortOrder} />
                <Input name="label" label="Özellik" defaultValue={lbl(s.labels)} />
                <Input name="value" label="Değer" defaultValue={lbl(s.values)} />
                <Input name="unit" label="Birim" defaultValue={s.unit ?? ""} />
                {canEdit ? (
                  <div className="flex items-end gap-2">
                    <SubmitButton size="sm" variant="secondary">
                      Kaydet
                    </SubmitButton>
                    <FormMessage />
                  </div>
                ) : null}
              </ActionForm>
              <div className="mt-2 flex flex-wrap gap-2">
                {canVerify && s.status !== "VERIFIED" ? (
                  <ActionForm action={verifySpecAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="specId" value={s.id} />
                    <Input name="source" label="Doğrulama kaynağı" placeholder="Teknik föy, tarih" />
                    <SubmitButton size="sm">Doğrula</SubmitButton>
                    <FormMessage />
                  </ActionForm>
                ) : null}
                {canEdit && s.status !== "VERIFIED" ? (
                  <ActionForm action={deleteSpecAction} className="flex items-end gap-2">
                    <input type="hidden" name="specId" value={s.id} />
                    <ConfirmSubmit>Sil</ConfirmSubmit>
                    <FormMessage />
                  </ActionForm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {product.specs.length === 0 ? <p className="mb-3 text-sm text-steel">Kaynakta doğrulanmış teknik tablo yok; uydurma değer girilmez.</p> : null}
        {canEdit ? (
          <ActionForm action={saveSpecAction} className="mt-4 grid gap-3 rounded-[var(--radius-md)] border border-dashed border-line-strong p-3 sm:grid-cols-2" aria-label="Yeni özellik" resetOnOk>
            <input type="hidden" name="productId" value={product.id} />
            <Input name="key" label="Anahtar" placeholder="motor_gucu" required />
            <Input name="label" label="Özellik adı" placeholder="Motor gücü" required />
            <Input name="value" label="Değer" required />
            <Input name="unit" label="Birim" placeholder="kW" />
            <input type="hidden" name="sortOrder" value={product.specs.length} />
            <div className="flex items-center gap-3 sm:col-span-2">
              <SubmitButton size="sm">Özellik ekle</SubmitButton>
              <FormMessage />
            </div>
          </ActionForm>
        ) : null}
      </Card>
      <Card title="Teknik dokümanlar (PDF)" description="Vitrinde yalnız doğrulanan doküman görünür. Doküman yoksa vitrinde PDF düğmesi çıkmaz.">
        <ul className="space-y-2">
          {product.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line p-3 text-sm">
              <div>
                <a href={d.publicPath} target="_blank" rel="noopener" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
                  {d.title}
                </a>
                <p className="text-xs text-steel">
                  {(d.bytes / 1024).toFixed(0)} KB · {d.locale?.toUpperCase() ?? "dil bağımsız"} · {fmtDateTime(d.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {d.status === "VERIFIED" ? <Badge tone="success">Yayında</Badge> : <Badge tone="warning">Doğrulanmadı</Badge>}
                {canVerify ? (
                  <ActionForm action={setDocumentStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="status" value={d.status === "VERIFIED" ? "UNVERIFIED" : "VERIFIED"} />
                    <SubmitButton size="sm" variant="secondary">
                      {d.status === "VERIFIED" ? "Yayından kaldır" : "Doğrula"}
                    </SubmitButton>
                    <FormMessage />
                  </ActionForm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {product.documents.length === 0 ? <p className="mb-3 text-sm text-steel">Doküman yok.</p> : null}
        {canDocs ? (
          <ActionForm action={uploadDocumentAction} className="mt-4 grid gap-3 rounded-[var(--radius-md)] border border-dashed border-line-strong p-3" aria-label="Doküman yükle" resetOnOk>
            <input type="hidden" name="productId" value={product.id} />
            <label className="flex min-w-0 flex-col gap-1.5 text-sm font-semibold text-ink">
              PDF dosyası (en fazla 20 MB)
              <input type="file" name="file" accept="application/pdf" required className="w-full min-w-0 min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface p-2 text-sm font-normal" />
            </label>
            <Input name="title" label="Başlık" placeholder="Teknik föy" required />
            <Select name="locale" label="Dil" defaultValue="">
              <option value="">Dil bağımsız</option>
              {(["tr", "en", "fr", "ru", "ar"] as const).map((l) => (
                <option key={l} value={l}>
                  {LOCALE_META[l].nativeName}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-3">
              <SubmitButton size="sm" pendingText="Yükleniyor…">
                Yükle
              </SubmitButton>
              <FormMessage />
            </div>
          </ActionForm>
        ) : null}
      </Card>
    </div>
  );
}

async function HistoryTab({ productId }: { productId: string }) {
  const db = requireDb();
  const [logs, priceLogs] = await Promise.all([
    db.auditLog.findMany({ where: { entityType: "Product", entityId: productId }, orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true } } } }),
    db.auditLog.findMany({ where: { entityType: "Price", after: { path: ["productId"], equals: productId } }, orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { name: true } } } }),
  ]);
  const all = [...logs, ...priceLogs].sort((a, b) => +b.createdAt - +a.createdAt);
  return (
    <Card title="Değişiklik geçmişi" description="Kim, ne zaman, neyi değiştirdi (önce → sonra). Kişisel veri ve gizli alanlar kaydedilmez.">
      {all.length === 0 ? <p className="text-sm text-steel">Bu ürün için henüz yönetim işlemi yok.</p> : null}
      <ol className="space-y-3">
        {all.map((l) => (
          <li key={l.id} className="rounded-[var(--radius-md)] border border-line p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <code className="text-xs font-semibold text-ink">{l.action}</code>
              <span className="text-xs text-steel">
                {fmtDateTime(l.createdAt)} · {l.actor?.name ?? "sistem"}
              </span>
            </p>
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-brand-700 dark:text-brand-300">Ayrıntı</summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {l.before ? <pre className="overflow-x-auto rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify(l.before, null, 1)}</pre> : null}
                {l.after ? <pre className="overflow-x-auto rounded bg-surface-2 p-2 text-[11px]">{JSON.stringify(l.after, null, 1)}</pre> : null}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </Card>
  );
}
