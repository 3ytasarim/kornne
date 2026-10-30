import Link from "next/link";
import { Plus } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/PageHeader";
import { FilterBar, FilterSearch, FilterSelect, ModuleState, Pagination } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { fmtDateTime, fold, pageParam, strParam } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { bulkAction } from "./actions";

export const metadata = { title: "Ürünler" };
const PER_PAGE = 25;
const PUBLIC_T = new Set(["LEGACY_SOURCE", "APPROVED"]);

/**
 * Product list (Sprint 6). The catalog is small (41 records), so filtering/sorting runs in memory on one query —
 * that keeps Turkish-aware search ("dos acma" finds "Döş Açma") exact; pagination is still enforced.
 */
export default async function ProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requireAdmin("products");
  const sp = await searchParams;
  const q = strParam(sp.q);
  const cat = strParam(sp.kategori);
  const st = strParam(sp.durum);
  const quality = strParam(sp.kalite);
  const lang = strParam(sp.dil);
  const sort = strParam(sp.sirala) || "sira";
  const page = pageParam(sp.sayfa);
  const db = requireDb();
  const [products, categories, conflicts] = await Promise.all([
    db.product.findMany({
      select: {
        id: true,
        sourceKey: true,
        sku: true,
        status: true,
        needsReview: true,
        reviewReasons: true,
        sortOrder: true,
        updatedAt: true,
        translations: { select: { locale: true, title: true, slug: true, status: true } },
        categories: { select: { isPrimary: true, category: { select: { key: true, translations: { where: { locale: "tr" }, select: { name: true } } } } } },
        prices: { select: { status: true, amountMinor: true, compareAtMinor: true, source: true } },
        _count: { select: { media: true } },
      },
    }),
    db.category.findMany({ where: { isAllProducts: false }, orderBy: { sortOrder: "asc" }, select: { key: true, translations: { where: { locale: "tr" }, select: { name: true } } } }),
    db.legacyMatchSuggestion.findMany({ where: { evidence: { path: ["priceEqual"], equals: false } }, select: { productId: true } }),
  ]);
  const conflictSet = new Set(conflicts.map((c) => c.productId));

  const rows = products
    .map((p) => {
      const tr = p.translations.find((t) => t.locale === "tr");
      const legacy = p.prices.filter((x) => x.source === "LEGACY_IMPORT");
      const invalidDiscount = legacy.some((x) => x.compareAtMinor !== null && x.compareAtMinor <= x.amountMinor);
      const verified = p.prices.some((x) => x.status === "VERIFIED");
      const pending = p.prices.some((x) => x.source === "ADMIN" && x.status === "UNVERIFIED");
      const visible = p.status === "PUBLISHED" && !p.needsReview;
      return { ...p, tr, invalidDiscount, verified, pending, visible, conflict: conflictSet.has(p.id), legacyId: p.sourceKey?.split(":").pop() ?? "—" };
    })
    .filter((p) => {
      if (q) {
        const hay = fold(`${p.tr?.title ?? ""} ${p.legacyId} ${p.sku ?? ""} ${p.tr?.slug ?? ""}`);
        if (!fold(q).split(/\s+/).every((t) => hay.includes(t))) return false;
      }
      if (cat && !p.categories.some((c) => c.category.key === cat)) return false;
      if (st === "yayinda" && !p.visible) return false;
      if (st === "taslak" && p.status !== "DRAFT") return false;
      if (st === "arsiv" && p.status !== "ARCHIVED") return false;
      if (st === "inceleme" && !p.needsReview) return false;
      if (quality === "celiski" && !p.conflict) return false;
      if (quality === "indirim" && !p.invalidDiscount) return false;
      if (quality === "onayli-fiyat" && !p.verified) return false;
      if (quality === "bekleyen-fiyat" && !p.pending) return false;
      if (quality === "gorselsiz" && p._count.media > 0) return false;
      if (lang && lang !== "tr") {
        const t = p.translations.find((x) => x.locale === lang.replace("-yok", ""));
        if (lang.endsWith("-yok") ? t : !t) return false;
      }
      return true;
    })
    .sort((a, b) => (sort === "ad" ? (a.tr?.title ?? "").localeCompare(b.tr?.title ?? "", "tr") : sort === "guncel" ? +b.updatedAt - +a.updatedAt : a.sortOrder - b.sortOrder || (a.sourceKey ?? "").localeCompare(b.sourceKey ?? "")));

  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages);
  const slice = rows.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const params = new URLSearchParams(Object.entries({ q, kategori: cat, durum: st, kalite: quality, dil: lang, sirala: sort === "sira" ? "" : sort }).filter(([, v]) => v));
  const href = (p: number) => `/admin/products?${new URLSearchParams([...params, ...(p > 1 ? [["sayfa", String(p)]] : [])]).toString()}`;
  const canBulk = allowed(user.role, "product.edit");

  return (
    <>
      <PageHeader
        title="Ürünler"
        description="Neon'daki katalog. Ürün silinmez; taslağa alınır veya arşivlenir. İncelemedeki ürünler (ör. #208) yalnız yetkili onayıyla yayına çıkar."
        actions={
          <div className="flex items-center gap-3">
            <ModuleState state="live" />
            {canBulk ? (
              <Link href="/admin/products/new" className={buttonClass("primary", "md")}>
                <Plus aria-hidden="true" className="size-4" /> Yeni ürün
              </Link>
            ) : null}
          </div>
        }
      />
      <FilterBar action="/admin/products" resetHref="/admin/products" label="Ürün filtreleri">
        <FilterSearch value={q} placeholder="Ad, ürün no, SKU…" />
        <FilterSelect name="kategori" label="Kategori" value={cat} options={[["", "Tümü"], ...categories.map((c) => [c.key, c.translations[0]?.name ?? c.key] as [string, string])]} />
        <FilterSelect name="durum" label="Yayın durumu" value={st} options={[["", "Tümü"], ["yayinda", "Vitrinde"], ["taslak", "Taslak"], ["arsiv", "Arşiv"], ["inceleme", "İncelemede"]]} />
        <FilterSelect name="kalite" label="Veri kalitesi" value={quality} options={[["", "Tümü"], ["celiski", "Dil-fiyat çelişkisi"], ["indirim", "Hatalı indirim"], ["bekleyen-fiyat", "Onay bekleyen fiyat"], ["onayli-fiyat", "Onaylı fiyat"], ["gorselsiz", "Görselsiz"]]} />
        <FilterSelect name="dil" label="Dil" value={lang} options={[["", "Tümü"], ["en", "EN sürümü var"], ["en-yok", "EN sürümü yok"], ["fr", "FR sürümü var"], ["fr-yok", "FR sürümü yok"]]} />
        <FilterSelect name="sirala" label="Sırala" value={sort} options={[["sira", "Vitrin sırası"], ["ad", "Ada göre"], ["guncel", "Son güncellenen"]]} />
      </FilterBar>

      <ActionForm action={bulkAction} aria-label="Toplu işlem">
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <caption className="sr-only">Ürünler</caption>
            <thead className="bg-surface-2 text-xs tracking-wide text-steel uppercase">
              <tr>
                {canBulk ? (
                  <th scope="col" className="w-12 px-4 py-3">
                    <span className="sr-only">Seç</span>
                  </th>
                ) : null}
                <th scope="col" className="px-4 py-3 text-start">Ürün</th>
                <th scope="col" className="px-4 py-3 text-start">No / SKU</th>
                <th scope="col" className="px-4 py-3 text-start">Kategori</th>
                <th scope="col" className="px-4 py-3 text-start">Durum</th>
                <th scope="col" className="px-4 py-3 text-start">Fiyat</th>
                <th scope="col" className="px-4 py-3 text-start">Diller</th>
                <th scope="col" className="px-4 py-3 text-end">Görsel</th>
                <th scope="col" className="px-4 py-3 text-start">Güncelleme</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-steel">
                    Filtreyle eşleşen ürün yok.
                  </td>
                </tr>
              ) : (
                slice.map((p) => (
                  <tr key={p.id} className="border-t border-line hover:bg-surface-2/60">
                    {canBulk ? (
                      <td className="px-4 py-3 align-top">
                        <input type="checkbox" name="ids" value={p.id} aria-label={`Seç: ${p.tr?.title ?? p.id}`} className="size-5 accent-brand-700" />
                      </td>
                    ) : null}
                    <td className="px-4 py-3 align-top">
                      <Link href={`/admin/products/${p.id}`} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
                        {p.tr?.title ?? "(başlıksız)"}
                      </Link>
                      {p.reviewReasons.length ? <p className="mt-0.5 text-xs text-steel">{p.reviewReasons.length} veri bayrağı</p> : null}
                    </td>
                    <td className="px-4 py-3 align-top tabular-nums">
                      #{p.legacyId}
                      {p.sku ? <span className="block text-xs text-steel">{p.sku}</span> : null}
                    </td>
                    <td className="px-4 py-3 align-top text-xs">{p.categories.find((c) => c.isPrimary)?.category.translations[0]?.name ?? p.categories[0]?.category.translations[0]?.name ?? "—"}</td>
                    <td className="px-4 py-3 align-top">
                      {p.needsReview ? <Badge tone="warning">İncelemede</Badge> : p.status === "PUBLISHED" ? <Badge tone="success">Vitrinde</Badge> : p.status === "ARCHIVED" ? <Badge tone="outline">Arşiv</Badge> : <Badge tone="neutral">Taslak</Badge>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {p.verified ? <Badge tone="success">Onaylı</Badge> : <Badge tone="warning">Onaysız</Badge>}
                        {p.pending ? <Badge tone="brand">Öneri var</Badge> : null}
                        {p.conflict ? <Badge tone="outline">Çelişki</Badge> : null}
                        {p.invalidDiscount ? <Badge tone="outline">Hatalı indirim</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs">
                      {p.translations
                        .sort((a, b) => a.locale.localeCompare(b.locale))
                        .map((t) => (
                          <span key={t.locale} className={PUBLIC_T.has(t.status) ? "me-1 font-semibold text-ink" : "me-1 text-steel line-through decoration-dotted"} title={t.status}>
                            {t.locale.toUpperCase()}
                          </span>
                        ))}
                    </td>
                    <td className="px-4 py-3 text-end align-top tabular-nums">{p._count.media}</td>
                    <td className="px-4 py-3 align-top text-xs text-steel">{fmtDateTime(p.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {canBulk ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-steel">
              Seçilenlere uygula
              <select name="op" defaultValue="draft" className="min-h-12 rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 text-sm font-normal text-ink">
                <option value="draft">Taslağa al (vitrinden kaldır)</option>
                <option value="archive">Arşivle</option>
              </select>
            </label>
            <SubmitButton variant="secondary" pendingText="Uygulanıyor…">
              Uygula
            </SubmitButton>
            <FormMessage />
            <p className="w-full text-xs text-steel">Toplu yayınlama bilinçli olarak yok: her ürün kendi ekranında, kontrol edilerek yayınlanır.</p>
          </div>
        ) : null}
      </ActionForm>
      <Pagination page={current} pages={pages} total={rows.length} href={href} />
    </>
  );
}
