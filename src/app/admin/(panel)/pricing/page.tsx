import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { FilterBar, FilterSearch, FilterSelect, ModuleState, Pagination } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDate, fold, pageParam, strParam } from "@/lib/admin/format";
import { livePrice } from "@/lib/admin/prices";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Fiyat merkezi" };
const PER_PAGE = 25;
type Evidence = { legacyPrice?: string; trPrice?: string; priceEqual?: boolean; legacyTitle?: string };
const dec = (v?: string) => (v ? formatMoney(BigInt(v.replace(".", ""))) : "—");

export default async function PricingPage({ searchParams }: PageProps<"/admin/pricing">) {
  await requireAdmin("pricing");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const f = strParam(sp.filtre);
  const page = pageParam(sp.sayfa);
  const db = requireDb();
  const [products, matches] = await Promise.all([
    db.product.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, sourceKey: true, status: true, needsReview: true, translations: { where: { locale: "tr" }, select: { title: true } }, prices: { orderBy: { createdAt: "desc" } } } }),
    db.legacyMatchSuggestion.findMany({ select: { productId: true, sourceLocale: true, sourceLegacyId: true, evidence: true } }),
  ]);
  const rows = products.map((p) => {
    const legacy = p.prices.find((x) => x.source === "LEGACY_IMPORT");
    const conflicts = matches.filter((m) => m.productId === p.id && (m.evidence as Evidence).priceEqual === false);
    return {
      id: p.id,
      title: p.translations[0]?.title ?? p.id,
      legacyId: p.sourceKey?.split(":").pop() ?? "—",
      legacy,
      live: livePrice(p.prices),
      pending: p.prices.filter((x) => x.source === "ADMIN" && x.status === "UNVERIFIED"),
      invalidDiscount: !!legacy && legacy.compareAtMinor !== null && legacy.compareAtMinor <= legacy.amountMinor,
      conflicts,
      visible: p.status === "PUBLISHED" && !p.needsReview,
    };
  });
  const filtered = rows.filter((r) => {
    if (q && !fold(`${r.title} ${r.legacyId}`).includes(fold(q))) return false;
    if (f === "celiski") return r.conflicts.length > 0;
    if (f === "indirim") return r.invalidDiscount;
    if (f === "bekleyen") return r.pending.length > 0;
    if (f === "onayli") return !!r.live;
    if (f === "onaysiz") return !r.live;
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const params = new URLSearchParams(Object.entries({ q, filtre: f }).filter(([, v]) => v));
  const totals = { verified: rows.filter((r) => r.live).length, conflict: rows.filter((r) => r.conflicts.length).length, discount: rows.filter((r) => r.invalidDiscount).length, pending: rows.reduce((a, r) => a + r.pending.length, 0) };

  return (
    <>
      <PageHeader title="Fiyat merkezi" description="Eski siteden gelen 41 ham fiyat UNVERIFIED kalır ve vitrinde gösterilmez. Satış fiyatı; KDV, para birimi, geçerlilik ve kaynakla girilen yeni bir öneriyle ve ikinci bir yetkilinin onayıyla yayına çıkar." actions={<ModuleState state="live" />} />
      <Notice className="mb-6">Toplu onay yoktur. Onaylı fiyat yalnız vitrindeki gösterimi değiştirir; sepet ve ödeme, tüm ticari ön koşullar (unvan, KDV, kargo, yasal metin, ödeme sağlayıcısı) sunucuda tamamlanana kadar kapalı kalır.</Notice>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Onaylı fiyat" value={`${totals.verified} / ${rows.length}`} tone={totals.verified ? "success" : "warning"} />
        <StatCard label="Onay bekleyen öneri" value={totals.pending} />
        <StatCard label="Dil-fiyat çelişkili ürün" value={totals.conflict} tone="warning" hint="TR ≠ EN/FR eski fiyatı" />
        <StatCard label="Hatalı indirim" value={totals.discount} tone="warning" hint="Eski fiyat ≤ satış fiyatı" />
      </div>
      <FilterBar action="/admin/pricing" resetHref="/admin/pricing" label="Fiyat filtreleri">
        <FilterSearch value={q} placeholder="Ürün adı veya no" />
        <FilterSelect name="filtre" label="Göster" value={f} options={[["", "Tümü"], ["celiski", "Dil-fiyat çelişkisi"], ["indirim", "Hatalı indirim"], ["bekleyen", "Onay bekleyen"], ["onayli", "Onaylı"], ["onaysiz", "Onaysız"]]} />
      </FilterBar>
      <DataTable
        caption="Ürün fiyatları"
        rows={filtered.slice((cur - 1) * PER_PAGE, cur * PER_PAGE)}
        rowKey={(r) => r.id}
        empty="Eşleşen ürün yok."
        columns={[
          {
            key: "t",
            header: "Ürün",
            cell: (r) => (
              <Link href={`/admin/pricing/${r.id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
                {r.title}
                <span className="ms-1 text-xs font-normal text-steel">#{r.legacyId}</span>
              </Link>
            ),
          },
          { key: "raw", header: "Eski site ham fiyatı (TR)", cell: (r) => (r.legacy ? <span title={`kayıt ${fmtDate(r.legacy.createdAt)}`}>{r.legacy.rawAmount ?? formatMoney(r.legacy.amountMinor)}</span> : "—") },
          { key: "old", header: "Ham eski fiyat", cell: (r) => (r.legacy?.rawCompareAt ? <span className={r.invalidDiscount ? "text-signal" : ""}>{r.legacy.rawCompareAt}</span> : "—") },
          {
            key: "c",
            header: "EN/FR eski fiyatı",
            cell: (r) =>
              r.conflicts.length ? (
                <span className="text-xs">
                  {r.conflicts.map((m) => (
                    <span key={`${m.sourceLocale}${m.sourceLegacyId}`} className="block text-signal">
                      {m.sourceLocale.toUpperCase()} #{m.sourceLegacyId}: {dec((m.evidence as Evidence).legacyPrice)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-xs text-steel">uyumlu / kayıt yok</span>
              ),
          },
          { key: "live", header: "Vitrindeki fiyat", cell: (r) => (r.live ? <span className="font-semibold text-success">{formatMoney(r.live.amountMinor)} {r.live.vatIncluded ? "KDV dahil" : "+KDV"}</span> : <span className="text-steel">Teklif alın</span>) },
          { key: "s", header: "Durum", cell: (r) => <div className="flex flex-wrap gap-1">{r.live ? <Badge tone="success">Onaylı</Badge> : <Badge tone="warning">Onaysız</Badge>}{r.pending.length ? <Badge tone="brand">{r.pending.length} öneri</Badge> : null}{r.invalidDiscount ? <Badge tone="outline">Hatalı indirim</Badge> : null}{!r.visible ? <Badge tone="outline">Vitrinde değil</Badge> : null}</div> },
        ]}
      />
      <Pagination page={cur} pages={pages} total={filtered.length} href={(p) => `/admin/pricing?${new URLSearchParams([...params, ...(p > 1 ? [["sayfa", String(p)]] : [])])}`} />
    </>
  );
}
