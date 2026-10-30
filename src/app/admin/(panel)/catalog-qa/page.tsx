import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

export const metadata = { title: "Katalog QA" };
export const dynamic = "force-dynamic";

type Evidence = { trTitle: string; legacyTitle: string; legacySlug: string; trPrice: string; legacyPrice: string; priceEqual: boolean; sharedImages: number; trImages: number; legacyImages: number; legacyUrl: string };
const money = (dec: string) => (dec ? formatMoney(BigInt(dec.replace(".", "")), "TRY", "tr") : "—");
const level = (c: number) => (c >= 85 ? <Badge tone="success">Yüksek {c}</Badge> : c >= 60 ? <Badge tone="warning">Orta {c}</Badge> : <Badge tone="signal">Düşük {c}</Badge>);

/**
 * Catalog QA / data control (Sprint 3). Read-mostly view over the imported legacy data; the only write actions are
 * the EN/FR match decisions. Full catalog CRUD is Sprint 6 — this screen does not pretend to be it.
 */
export default async function CatalogQaPage() {
  await requireAdmin("products");
  const db = requireDb();
  const [byLocale, products, prices, missingMedia, matches, redirects, runs, mediaCount] = await Promise.all([
    db.legacySourceRecord.groupBy({ by: ["locale"], where: { entityType: "product" }, _count: true }),
    db.product.findMany({ select: { id: true, sourceKey: true, status: true, needsReview: true, reviewReasons: true, translations: { select: { locale: true, title: true, slug: true, status: true } } }, orderBy: { sortOrder: "asc" } }),
    db.price.findMany({ select: { productId: true, amountMinor: true, compareAtMinor: true, status: true, rawAmount: true, rawCompareAt: true } }),
    db.legacySourceRecord.findMany({ where: { entityType: "media", migrationStatus: "missing_at_source" }, select: { legacyId: true, sourceUrl: true, payload: true } }),
    db.legacyMatchSuggestion.findMany({ orderBy: [{ status: "asc" }, { confidence: "desc" }], include: { product: { select: { translations: { where: { locale: "tr" }, select: { title: true } } } } } }),
    db.redirect.groupBy({ by: ["source"], _count: true }),
    db.importRun.findMany({ orderBy: { startedAt: "desc" }, take: 5, select: { id: true, mode: true, status: true, startedAt: true, sourceHash: true } }),
    db.mediaAsset.count(),
  ]);
  const count = (l: string) => byLocale.find((x) => x.locale === l)?._count ?? 0;
  const titleOf = (id: string) => products.find((p) => p.id === id)?.translations.find((t) => t.locale === "tr")?.title ?? id;
  const publicCount = products.filter((p) => p.status === "PUBLISHED" && !p.needsReview).length;
  const held = products.filter((p) => p.needsReview || p.status !== "PUBLISHED");
  const invalidDiscount = prices.filter((p) => p.compareAtMinor !== null && p.compareAtMinor <= p.amountMinor);
  const conflicts = matches.filter((m) => !(m.evidence as Evidence).priceEqual);
  const conflictProducts = new Set(conflicts.map((m) => m.productId));
  const pending = matches.filter((m) => m.status === "SUGGESTED");
  const verifiedPrices = prices.filter((p) => p.status === "VERIFIED").length;

  return (
    <>
      <PageHeader title="Katalog QA / Veri Kontrol" description="kornne.com'dan aktarılan kayıtların doğrulama kuyruğu. Fiyatlar doğrulanana kadar vitrinde fiyat gösterilmez; EN/FR kayıtları yalnız burada onaylanınca ürüne bağlanır." />

      <section aria-labelledby="qa-counts" className="mb-10">
        <h2 id="qa-counts" className="mb-3 text-sm font-semibold text-steel">
          Kaynak kayıtlar ve vitrin
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="TR kaynak ürün" value={count("tr")} hint="Vitrin 40 diyordu" />
          <StatCard label="EN / FR ayrı kayıt" value={`${count("en")} / ${count("fr")}`} />
          <StatCard label="RU / AR ürün" value={`${count("ru")} / ${count("ar")}`} tone="warning" hint="Kaynakta yok" />
          <StatCard label="Vitrinde görünür" value={publicCount} tone="success" />
          <StatCard label="İncelemede (gizli)" value={held.length} tone={held.length ? "warning" : "neutral"} />
          <StatCard label="Doğrulanmış fiyat" value={`${verifiedPrices} / ${prices.length}`} tone="warning" hint="Teklif usulü" />
          <StatCard label="Medya (orijinal)" value={mediaCount} />
          <StatCard label="Kırık medya (kaynakta)" value={missingMedia.length} tone="warning" />
          <StatCard label="Fiyat çelişkili ürün" value={conflictProducts.size} tone="warning" hint="TR ↔ EN/FR" />
          <StatCard label="Hatalı indirim" value={invalidDiscount.length} tone="warning" />
          <StatCard label="Bekleyen eşleşme" value={pending.length} />
          <StatCard label="Yönlendirme" value={redirects.reduce((a, r) => a + r._count, 0)} />
        </div>
      </section>

      <section aria-labelledby="qa-held" className="mb-10 space-y-3">
        <h2 id="qa-held" className="text-h3 font-bold text-ink">
          İncelemede tutulan ürünler
        </h2>
        <DataTable
          caption="İncelemede tutulan ürünler"
          rows={held}
          rowKey={(p) => p.id}
          empty="Yok"
          columns={[
            { key: "id", header: "Kaynak", cell: (p) => p.sourceKey },
            { key: "t", header: "Ürün", cell: (p) => <span className="font-medium text-ink">{p.translations.find((t) => t.locale === "tr")?.title}</span> },
            { key: "r", header: "Neden", cell: (p) => p.reviewReasons.filter((r) => r.startsWith("not_listed")).join(", ") || p.status },
            { key: "s", header: "Eski URL", cell: (p) => <code className="text-xs">/urun/{p.translations.find((t) => t.locale === "tr")?.slug}</code> },
          ]}
        />
        <p className="text-xs text-steel">Eski URL geçici (307) olarak kategorisine yönlenir; yayın kararı Sprint 6 ürün düzenleme ekranında verilecek.</p>
      </section>

      <section aria-labelledby="qa-discount" className="mb-10 space-y-3">
        <h2 id="qa-discount" className="text-h3 font-bold text-ink">
          Hatalı indirimler (eski fiyat ≤ satış fiyatı)
        </h2>
        <DataTable
          caption="Hatalı indirimler"
          rows={invalidDiscount}
          rowKey={(p) => p.productId}
          empty="Yok"
          columns={[
            { key: "t", header: "Ürün", cell: (p) => titleOf(p.productId) },
            { key: "a", header: "Ham satış", align: "end", cell: (p) => p.rawAmount },
            { key: "c", header: "Ham eski fiyat", align: "end", cell: (p) => p.rawCompareAt },
            { key: "s", header: "Durum", cell: (p) => <Badge tone="warning">{p.status}</Badge> },
          ]}
        />
      </section>

      <section aria-labelledby="qa-media" className="mb-10 space-y-3">
        <h2 id="qa-media" className="text-h3 font-bold text-ink">
          Kaynakta kırık medya
        </h2>
        <DataTable
          caption="Kırık medya"
          rows={missingMedia}
          rowKey={(m) => m.legacyId}
          empty="Yok"
          columns={[
            { key: "u", header: "Eski URL", cell: (m) => <code className="text-xs break-all">{m.sourceUrl}</code> },
            { key: "h", header: "HTTP", cell: (m) => (m.payload as { http_status?: string }).http_status },
            { key: "k", header: "Kullanım", cell: (m) => (m.payload as { usages?: string }).usages },
          ]}
        />
        <p className="text-xs text-steel">Yeni sitede de 404 döner (sahte 200 yok). Orijinaller müşteriden istenecek.</p>
      </section>

      <section aria-labelledby="qa-matches" className="mb-10 space-y-3">
        <h2 id="qa-matches" className="text-h3 font-bold text-ink">
          EN / FR eşleşme önerileri
        </h2>
        <Notice>
          Güven puanı: kayıt sırası 20 + aynı fotoğraf dosyası (SHA-256) 45 + aynı fiyat 25 + aynı eski fiyat 10. Onay, eski kaydın başlık/açıklamasını çeviri olarak ekler; <strong>fiyat alınmaz</strong> (TR tek kaynak).
        </Notice>
        <DataTable
          caption="Eşleşme önerileri"
          rows={matches}
          rowKey={(m) => m.id}
          empty="Öneri yok"
          columns={[
            { key: "l", header: "Dil", cell: (m) => m.sourceLocale.toUpperCase() },
            { key: "src", header: "Eski kayıt", cell: (m) => <span lang={m.sourceLocale}>#{m.sourceLegacyId} {(m.evidence as Evidence).legacyTitle}</span> },
            { key: "tr", header: "TR ürün", cell: (m) => m.product.translations[0]?.title },
            { key: "c", header: "Güven", cell: (m) => level(m.confidence) },
            {
              key: "e",
              header: "Kanıt",
              cell: (m) => {
                const e = m.evidence as Evidence;
                return (
                  <span className="text-xs text-steel">
                    görsel {e.sharedImages}/{e.legacyImages} ortak · fiyat {e.priceEqual ? "aynı" : <strong className="text-signal">{`${money(e.legacyPrice)} ≠ ${money(e.trPrice)}`}</strong>}
                  </span>
                );
              },
            },
            { key: "s", header: "Karar", align: "end", cell: (m) => (m.status === "SUGGESTED" ? <Link href={`/admin/translations/matches/${m.id}`} aria-label={`İncele: ${m.sourceLocale.toUpperCase()} #${m.sourceLegacyId}`} className="font-semibold text-brand-700 underline dark:text-brand-300">İncele ve karar ver</Link> : <Badge tone={m.status === "APPROVED" ? "success" : "outline"}>{m.status}</Badge>) },
          ]}
        />
      </section>

      <section aria-labelledby="qa-runs" className="space-y-3">
        <h2 id="qa-runs" className="text-h3 font-bold text-ink">
          Son içe aktarma çalıştırmaları
        </h2>
        <DataTable
          caption="İçe aktarma çalıştırmaları"
          rows={runs}
          rowKey={(r) => r.id}
          empty="Yok"
          columns={[
            { key: "d", header: "Tarih", cell: (r) => r.startedAt.toLocaleString("tr-TR") },
            { key: "m", header: "Mod", cell: (r) => r.mode },
            { key: "s", header: "Durum", cell: (r) => <Badge tone={r.status === "APPLIED" ? "success" : "outline"}>{r.status}</Badge> },
            { key: "h", header: "Kaynak hash", cell: (r) => <code className="text-xs">{r.sourceHash.slice(0, 12)}</code> },
            { key: "i", header: "Run ID", cell: (r) => <code className="text-xs">{r.id}</code> },
          ]}
        />
      </section>
    </>
  );
}
