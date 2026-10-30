import Link from "next/link";
import { ActionForm, FormMessage, SubmitButton } from "@/components/admin/forms";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { SEO_NAV } from "@/components/admin/subnavs";
import { Card, FilterBar, FilterSearch, FilterSelect, ModuleState, Pagination, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import { fmtDateTime, pageParam, strParam } from "@/lib/admin/format";
import type { StoredPage, StoredResults } from "@/lib/admin/seo-audit";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { resolvePublicPath } from "@/lib/i18n/routes";
import { isIndexable, seoLocales } from "@/lib/seo/site";
import { runSeoAuditAction } from "../actions";

export const metadata = { title: "SEO QA" };
const PER = 50;
const SEV_TONE = { error: "signal", warning: "warning", info: "outline" } as const;
const SEV_LABEL = { error: "Hata", warning: "Uyarı", info: "Bilgi" } as const;
const KIND_LABEL: Record<string, string> = {
  home: "Ana sayfa", category: "Kategori", "category-page": "Kategori sayfa n", "category-filter": "Kategori filtre", product: "Ürün", "product-missing-locale": "Çevirisiz ürün URL'si", cms: "Sayfa", "cms-fallback": "Sayfa (TR yedek)", legal: "Yasal", blog: "Blog", faq: "SSS", search: "Arama", contact: "İletişim", quote: "Teklif listesi", cart: "Sepet", checkout: "Ödeme", "404": "404 testi", admin: "Admin", "legacy-redirect": "Eski URL 301", "held-product": "İncelemedeki ürün 307",
};

/**
 * Admin › SEO › SEO QA (Sprint 8): URL-level technical SEO audit of THIS application (status, index/noindex,
 * canonical, hreflang + x-default, metadata, OG/Twitter, JSON-LD rules, redirects in one hop, robots, sitemap).
 * Each finding has a suggested fix and — where the content lives in the admin — a deep link to the editor.
 */
export default async function SeoQaPage({ searchParams }: PageProps<"/admin/seo/qa">) {
  const user = await requireAdmin("seo");
  const sp = await searchParams;
  const sev = strParam(sp.onem);
  const kind = strParam(sp.tur);
  const q = strParam(sp.q);
  const page = pageParam(sp.sayfa);
  const db = requireDb();
  const runs = await db.seoAuditRun.findMany({ orderBy: { startedAt: "desc" }, take: 8, select: { id: true, mode: true, baseUrl: true, startedAt: true, finishedAt: true, urlCount: true, errorCount: true, warningCount: true } });
  const runId = strParam(sp.run) || runs.find((r) => r.finishedAt && r.errorCount >= 0)?.id;
  const run = runId ? await db.seoAuditRun.findUnique({ where: { id: runId } }) : null;
  const results = (run?.results ?? null) as StoredResults | null;

  // deep links: public path → the admin editor that owns the content
  const [products, categories, pages] = await Promise.all([
    db.productTranslation.findMany({ select: { slug: true, productId: true } }),
    db.categoryTranslation.findMany({ select: { slug: true, categoryId: true } }),
    db.pageTranslation.findMany({ where: { publishedSlug: { not: null } }, select: { publishedSlug: true, pageId: true, locale: true } }),
  ]);
  const productBySlug = new Map(products.map((p) => [p.slug, p.productId]));
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.categoryId]));
  const pageBySlug = new Map(pages.map((p) => [`${p.locale}:${p.publishedSlug}`, p]));
  const editLink = (p: StoredPage): string | null => {
    if (p.kind === "legacy-redirect") return `/admin/redirects?q=${encodeURIComponent(p.path)}`;
    const { locale, internalPath } = resolvePublicPath(p.path.split("?")[0]!);
    const [, seg, slug] = internalPath.split("/");
    if (!slug) return null;
    if (seg === "urun" && productBySlug.has(slug)) return `/admin/products/${productBySlug.get(slug)}`;
    if (seg === "kategori" && categoryBySlug.has(slug)) return `/admin/categories/${categoryBySlug.get(slug)}`;
    if ((seg === "sayfa" || seg === "blog") && pageBySlug.has(`${locale}:${slug}`)) return `/admin/content/${pageBySlug.get(`${locale}:${slug}`)!.pageId}?dil=${locale}`;
    return null;
  };

  const all = results?.pages ?? [];
  const filtered = all.filter((p) => (!kind || p.kind === kind) && (!q || p.path.includes(q) || p.findings.some((f) => f.code.includes(q))) && (!sev || (sev === "temiz" ? p.findings.length === 0 : p.findings.some((f) => f.severity === sev))));
  const pages_ = Math.max(1, Math.ceil(filtered.length / PER));
  const shown = filtered.slice((page - 1) * PER, page * PER);
  const qs = (n: number) => `/admin/seo/qa?${new URLSearchParams({ ...(run ? { run: run.id } : {}), ...(sev ? { onem: sev } : {}), ...(kind ? { tur: kind } : {}), ...(q ? { q } : {}), sayfa: String(n) })}`;
  const canRun = allowed(user.role, "seo.audit");
  const canExport = allowed(user.role, "seo.export");
  const extraFindings = [...(results?.sitemap.findings ?? []).map((f) => ({ where: "sitemap.xml", ...f })), ...(results?.robots ?? []).map((f) => ({ where: "robots.txt", ...f }))];

  return (
    <>
      <PageHeader
        title="SEO QA — URL denetimi"
        description="Uygulamanın kendi sayfaları gerçek HTTP yanıtlarıyla denetlenir: durum kodu, index/noindex, canonical, hreflang/x-default, başlık/açıklama, OG/Twitter, JSON-LD kuralları, eski URL yönlendirmeleri (tek adım), robots.txt ve sitemap. Google’a hiçbir şey gönderilmez."
        actions={<ModuleState state="live" />}
      />
      <SubNav items={SEO_NAV} current="/admin/seo/qa" />
      <Notice tone={isIndexable() ? "warning" : "info"} className="mb-6">
        Bu ortam: <strong>{isIndexable() ? "İNDEKSLENEBİLİR (üretim benzeri)" : "noindex (geliştirme / önizleme)"}</strong> · SEO dilleri: {seoLocales().join(", ").toUpperCase()}. Geliştirme modunda her sayfanın noindex, robots.txt’nin kapalı ve sitemap’in boş olması beklenir; üretim kuralları çevrimdışı “prodlike” önizlemede (localhost:3471) doğrulanır.
      </Notice>
      {canRun ? (
        <Card className="mb-6" title="Yeni denetim" description="≈250 URL; 20–60 sn sürebilir. Hedef sunucu tarafında belirlenir (yalnız bu uygulama).">
          <ActionForm action={runSeoAuditAction} className="flex flex-wrap items-center gap-3" aria-label="SEO denetimi başlat">
            <SubmitButton pendingText="Denetleniyor…">Denetimi çalıştır</SubmitButton>
            <FormMessage />
          </ActionForm>
        </Card>
      ) : null}

      {!run || !results ? (
        <Notice>Henüz tamamlanmış denetim yok.</Notice>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Denetlenen URL" value={run.urlCount} hint={`${run.mode} · ${fmtDateTime(run.startedAt)}`} />
            <StatCard label="Hata" value={run.errorCount} tone={run.errorCount ? "warning" : "success"} />
            <StatCard label="Uyarı" value={run.warningCount} tone={run.warningCount ? "warning" : "success"} />
            <StatCard label="İndekslenebilir (200)" value={all.filter((p) => p.indexable).length} />
            <StatCard label="Sitemap" value={`${results.sitemap.urlCount} URL`} hint={`${results.sitemap.imageCount} görsel`} />
          </div>
          {extraFindings.length ? (
            <Card className="mb-6" title="robots.txt / sitemap">
              <ul className="space-y-2 text-sm">
                {extraFindings.map((f, i) => (
                  <li key={i}>
                    <Badge tone={SEV_TONE[f.severity]}>{SEV_LABEL[f.severity]}</Badge> <code>{f.where}</code> {f.message} — <span className="text-steel">{f.fix}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <FilterBar action="/admin/seo/qa" resetHref={`/admin/seo/qa?run=${run.id}`}>
            <input type="hidden" name="run" value={run.id} />
            <FilterSelect name="onem" label="Önem" value={sev} options={[["", "Tümü"], ["error", "Hata"], ["warning", "Uyarı"], ["info", "Bilgi"], ["temiz", "Bulgusuz"]]} />
            <FilterSelect name="tur" label="Sayfa türü" value={kind} options={[["", "Tümü"], ...Object.keys(results.byKind).sort().map((k) => [k, `${KIND_LABEL[k] ?? k} (${results.byKind[k]})`] as [string, string])]} />
            <FilterSearch value={q} label="URL / bulgu kodu" placeholder="/urun/… veya canonical" />
          </FilterBar>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm text-steel">
            <span>
              {filtered.length} URL · bulgu kodları: {Object.entries(results.byCode).map(([c, n]) => `${c} ${n}`).join(" · ") || "yok"}
            </span>
            {canExport ? (
              <a href={`/admin/seo/qa/export?run=${run.id}`} className="font-semibold text-brand-700 underline dark:text-brand-300">
                CSV indir (kişisel veri içermez)
              </a>
            ) : null}
          </div>
          <Card>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
              <table className="w-full min-w-[64rem] text-sm">
                <caption className="sr-only">URL bazlı SEO denetim sonuçları</caption>
                <thead className="bg-surface-2 text-xs text-steel uppercase">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-start">URL</th>
                    <th scope="col" className="px-3 py-2 text-start">Tür</th>
                    <th scope="col" className="px-3 py-2 text-start">HTTP</th>
                    <th scope="col" className="px-3 py-2 text-start">İndeks</th>
                    <th scope="col" className="px-3 py-2 text-start">Canonical / hreflang</th>
                    <th scope="col" className="px-3 py-2 text-start">Bulgular ve öneri</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const edit = editLink(p);
                    return (
                      <tr key={p.path} className="border-t border-line align-top">
                        <td className="max-w-[18rem] px-3 py-2">
                          <a href={p.path} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline dark:text-brand-300">
                            {decodeURIComponent(p.path)}
                          </a>
                          {edit ? (
                            <Link href={edit} className="mt-1 block text-xs font-semibold text-ink underline">
                              Düzenle →
                            </Link>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">{KIND_LABEL[p.kind] ?? p.kind}</td>
                        <td className="px-3 py-2 text-xs">
                          {p.status}
                          {p.location ? <span className="block break-all text-steel">→ {decodeURIComponent(p.location.replace(/^https?:\/\/[^/]+/, ""))}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-xs">{p.status !== 200 ? "—" : p.indexable ? <Badge tone="success">index</Badge> : <Badge tone="outline">noindex</Badge>}</td>
                        <td className="max-w-[16rem] px-3 py-2 text-xs break-all text-steel">
                          {p.canonical ? decodeURIComponent(p.canonical.replace(/^https?:\/\/[^/]+/, "")) : "—"}
                          <span className="block">{p.hreflang.length ? p.hreflang.join(", ") : "hreflang yok"}</span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {p.findings.length ? (
                            <ul className="space-y-1">
                              {p.findings.map((f, i) => (
                                <li key={i}>
                                  <Badge tone={SEV_TONE[f.severity]}>{SEV_LABEL[f.severity]}</Badge> {f.message} <span className="text-steel">— {f.fix}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-success">Sorun yok</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination page={page} pages={pages_} total={filtered.length} href={qs} />
        </>
      )}
      {runs.length ? (
        <Card className="mt-6" title="Son denetimler">
          <ul className="space-y-1 text-sm">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/seo/qa?run=${r.id}`} aria-current={r.id === run?.id ? "true" : undefined} className="text-brand-700 underline dark:text-brand-300">
                  {fmtDateTime(r.startedAt)}
                </Link>{" "}
                · {r.mode} · {r.finishedAt ? (r.errorCount < 0 ? "başarısız" : `${r.urlCount} URL · ${r.errorCount} hata · ${r.warningCount} uyarı`) : "çalışıyor…"}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
