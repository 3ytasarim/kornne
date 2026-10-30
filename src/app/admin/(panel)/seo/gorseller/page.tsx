import Image from "next/image";
import Link from "next/link";
import { ActionForm, FormMessage, SubmitButton } from "@/components/admin/forms";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { SEO_NAV } from "@/components/admin/subnavs";
import { Card, FilterBar, FilterSearch, FilterSelect, ModuleState, Pagination, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/States";
import broken from "@/data/broken-media.json";
import { pageParam, strParam } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { analyzeImages, loadImageRows, MERCHANT_MIN_2027, MERCHANT_MIN_DATE, MERCHANT_RECOMMENDED } from "@/lib/seo/image-audit";
import { verifyMediaFilesAction } from "../actions";

export const metadata = { title: "Görsel SEO" };
const PER = 40;
const src = (p: string) => `/upload/${p.replace(/^\/upload\//, "").split("/").map(encodeURIComponent).join("/")}`;
const MERCHANT_LABEL = { OK: ["≥ 500 px", "success"], BELOW_2027: ["500 px altı", "warning"], BELOW_NOW: ["100 px altı", "signal"], UNKNOWN: ["boyut yok", "outline"], NOT_USED: ["vitrinde değil", "outline"] } as const;

/**
 * Admin › SEO › Görsel SEO (Sprint 8): work list over the 445 original images — dimensions, MIME, size, SHA-256,
 * usage, alt text per language, byte-identical duplicates and Merchant image checks with reasons. Originals are
 * NEVER rewritten here; fixes are alt texts (media editor) or better originals from the client.
 */
export default async function ImageSeoPage({ searchParams }: PageProps<"/admin/seo/gorseller">) {
  const user = await requireAdmin("seo");
  const sp = await searchParams;
  const filter = strParam(sp.filtre) || "ana";
  const code = strParam(sp.kod);
  const q = strParam(sp.q);
  const page = pageParam(sp.sayfa);
  const { items, summary } = analyzeImages(await loadImageRows(requireDb()));
  const codes = [...new Set(items.flatMap((i) => i.issues.map((x) => x.code)))].sort();
  const list = items
    .filter((i) => (filter === "ana" ? i.isMainOfPublic : filter === "vitrin" ? i.usedBy.some((u) => u.public) : filter === "sorunlu" ? i.issues.some((x) => x.severity !== "info") : true))
    .filter((i) => !code || i.issues.some((x) => x.code === code))
    .filter((i) => !q || i.fileName.toLowerCase().includes(q.toLowerCase()) || i.usedBy.some((u) => u.productTitle.toLowerCase().includes(q.toLowerCase()) || u.productRef === q))
    .sort((a, b) => b.issues.filter((x) => x.severity === "error").length - a.issues.filter((x) => x.severity === "error").length || (Math.min(a.width ?? 0, a.height ?? 0) - Math.min(b.width ?? 0, b.height ?? 0)));
  const pages = Math.max(1, Math.ceil(list.length / PER));
  const shown = list.slice((page - 1) * PER, page * PER);
  const href = (n: number) => `/admin/seo/gorseller?${new URLSearchParams({ filtre: filter, ...(code ? { kod: code } : {}), ...(q ? { q } : {}), sayfa: String(n) })}`;

  return (
    <>
      <PageHeader title="Görsel SEO ve Merchant görsel kontrolü" description={`445 orijinal görsel salt-okunur denetlenir. Merchant asgari çözünürlüğü ${MERCHANT_MIN_DATE} itibarıyla ${MERCHANT_MIN_2027}×${MERCHANT_MIN_2027} (planlanan eşik), önerilen ${MERCHANT_RECOMMENDED} px. Filigran / yazı / logo otomatik tespit edilemez; dosya adı ve en-boy sezgileri yalnız “manuel inceleme” üretir.`} actions={<ModuleState state="live" />} />
      <SubNav items={SEO_NAV} current="/admin/seo/gorseller" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Toplam görsel" value={summary.total} hint={`${summary.usedByPublicProducts} vitrin ürünlerinde`} />
        <StatCard label="Ana görsel < 500 px" value={`${summary.mainBelow500} / ${summary.mainImages}`} tone={summary.mainBelow500 ? "warning" : "success"} hint={`< ${MERCHANT_RECOMMENDED} px: ${summary.mainBelow1500}`} />
        <StatCard label="Türkçe alt metni editörce yazılmamış" value={summary.altMissingTr} tone={summary.altMissingTr ? "warning" : "success"} />
        <StatCard label="Kırık eski görsel (kaynakta 404)" value={broken.length} tone="warning" hint="Uydurulmadı; eski URL 404 döner" />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Kaynakta kırık görseller" description="kornne.com'da da 404 idi (docs/audit/media-inventory.csv). Orijinal yalnız müşteriden alınabilir.">
          <ul className="space-y-1 text-sm">
            {broken.map((b) => (
              <li key={b.url}>
                <code className="text-xs break-all">{b.url.replace("https://kornne.com", "")}</code> <span className="text-steel">— {b.usage} · HTTP {b.status}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Dosya bütünlüğü" description="Orijinal + sunulan kopyanın SHA-256'sı ve gerçek biçimi (magic bytes) yeniden hesaplanır. Dosya değiştirilmez.">
          <KeyValuesLite rows={[["Yinelenen (bayt-bayt aynı) grup", summary.duplicateGroups], ["Şüpheli dosya adı (manuel inceleme)", summary.suspectNames], ["Kullanılmayan (arşiv, silinmez)", summary.orphans], ["Merchant dışı biçim", summary.nonMerchantMime], ["Sitedeki tüm 500 px altı", summary.allBelow500]]} />
          {allowed(user.role, "media.audit") ? (
            <ActionForm action={verifyMediaFilesAction} className="mt-4 flex flex-wrap items-center gap-3" aria-label="Dosya bütünlüğünü doğrula">
              <SubmitButton variant="secondary" size="sm" pendingText="Doğrulanıyor…">
                445 dosyayı doğrula
              </SubmitButton>
              <FormMessage />
            </ActionForm>
          ) : null}
        </Card>
      </div>
      <FilterBar action="/admin/seo/gorseller" resetHref="/admin/seo/gorseller">
        <FilterSelect name="filtre" label="Kapsam" value={filter} options={[["ana", "Vitrin ürünlerinin ana görselleri"], ["vitrin", "Vitrinde kullanılan tümü"], ["sorunlu", "Hata/uyarısı olan"], ["tum", "Tüm 445"]]} />
        <FilterSelect name="kod" label="Bulgu" value={code} options={[["", "Tümü"], ...codes.map((c) => [c, c] as [string, string])]} />
        <FilterSearch value={q} label="Dosya / ürün" placeholder="dosya adı, ürün adı veya eski no" />
      </FilterBar>
      {!shown.length ? (
        <Notice>Bu filtrede görsel yok.</Notice>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {shown.map((i) => {
              const [label, tone] = MERCHANT_LABEL[i.merchant];
              return (
                <li key={i.id} className="flex flex-col gap-4 p-4 sm:flex-row">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-2">
                    <Image src={src(i.publicPath)} alt="" fill sizes="96px" className="object-contain" />
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/media/${i.id}`} className="font-semibold break-all text-ink underline">
                        {i.fileName}
                      </Link>
                      <Badge tone={tone}>Merchant: {label}</Badge>
                      {i.isMainOfPublic ? <Badge tone="brand">ana görsel</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-steel">
                      {i.width && i.height ? `${i.width}×${i.height}` : "boyut ?"} · {i.mime} · {(i.bytes / 1024).toFixed(0)} KB · alt: {i.altLocales.length ? i.altLocales.join(", ").toUpperCase() : "yok"} · SHA-256 {i.sha256.slice(0, 12)}…
                    </p>
                    {i.usedBy.length ? (
                      <p className="mt-1 text-xs">
                        {i.usedBy.slice(0, 3).map((u) => (
                          <Link key={u.productId} href={`/admin/products/${u.productId}?tab=gorseller`} className="me-3 text-brand-700 underline dark:text-brand-300">
                            #{u.productRef} {u.productTitle.slice(0, 40)}
                            {u.public ? "" : " (vitrinde değil)"}
                          </Link>
                        ))}
                      </p>
                    ) : null}
                    {i.issues.length ? (
                      <ul className="mt-2 space-y-1 text-xs">
                        {i.issues.map((x) => (
                          <li key={x.code}>
                            <Badge tone={x.severity === "error" ? "signal" : x.severity === "warning" ? "warning" : "outline"}>{x.code}</Badge> {x.message} <span className="text-steel">— {x.fix}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Pagination page={page} pages={pages} total={list.length} href={href} />
    </>
  );
}

function KeyValuesLite({ rows }: { rows: [string, number][] }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-steel">{k}</dt>
          <dd className="text-end font-semibold text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
