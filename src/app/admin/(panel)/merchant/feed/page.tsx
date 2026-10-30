import Link from "next/link";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { MERCHANT_NAV } from "@/components/admin/subnavs";
import { Card, ModuleState, SubNav } from "@/components/admin/ui";
import { Notice } from "@/components/ui/States";
import { requireAdmin } from "@/lib/auth/guard";
import { allowed } from "@/lib/auth/rbac";
import { requireDb } from "@/lib/db";
import { evaluateCatalog } from "@/lib/merchant/facts";
import { buildFeed, FEED_COLUMNS, feedXml } from "@/lib/merchant/feed";
import { REASON_LABEL } from "@/lib/merchant/labels";
import { getSiteUrl } from "@/lib/seo/site";

export const metadata = { title: "Feed önizleme" };
export const dynamic = "force-dynamic";
const REQUIRED = ["id", "title", "description", "link", "image_link", "availability", "price", "condition"] as const;

/**
 * Admin › Merchant › Feed önizleme (Sprint 9): the feed EXACTLY as it would be generated now from the database —
 * READY items only — plus every excluded item with its reason codes. Dry-run: not published, not sent.
 */
export default async function FeedPreviewPage() {
  const user = await requireAdmin("merchant");
  const canPreview = allowed(user.role, "merchant.preview");
  const { ctx, candidates } = await evaluateCatalog(requireDb());
  const feed = buildFeed(candidates, ctx);
  const xml = feedXml(feed.items, { title: "KORNNE", link: getSiteUrl(), generatedAt: new Date() });
  const schemaProblems = feed.items.flatMap((it) => REQUIRED.filter((c) => !it[c]).map((c) => `${it.id}: ${c} boş`));
  return (
    <>
      <PageHeader title="Feed önizleme (dry-run)" description={`Merchant ürün verisi şartnamesindeki alanlar: ${FEED_COLUMNS.join(", ")}. Yalnız READY ürünler girer; onaysız fiyat, bilinmeyen stok veya eksik zorunlu alanlı ürün feed'e ASLA konmaz.`} actions={<ModuleState state="live" title="Önizleme — GÖNDERİLMEDİ" />} />
      <SubNav items={MERCHANT_NAV} current="/admin/merchant/feed" />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Feed'deki ürün" value={feed.items.length} tone={feed.items.length ? "success" : "warning"} />
        <StatCard label="Hariç tutulan" value={feed.excluded.length} />
        <StatCard label="Şema kontrolü" value={schemaProblems.length ? `${schemaProblems.length} sorun` : "geçerli"} tone={schemaProblems.length ? "warning" : "success"} hint="zorunlu alanlar + biçim" />
      </div>
      {canPreview ? (
        <p className="mb-6 flex flex-wrap gap-4 text-sm">
          {(["xml", "tsv", "csv"] as const).map((f) => (
            <a key={f} href={`/admin/merchant/feed/export?format=${f}`} className="font-semibold text-brand-700 underline dark:text-brand-300">
              {f.toUpperCase()} indir (önizleme)
            </a>
          ))}
        </p>
      ) : (
        <Notice className="mb-6">Feed dosyasını indirme yetkiniz yok (merchant.preview).</Notice>
      )}
      {feed.items.length === 0 ? <Notice tone="warning" className="mb-6">Şu an hiçbir ürün READY değil: feed boş üretilir (bu doğru davranıştır — sahte fiyat/stok ile doldurulmaz).</Notice> : null}
      <Card className="mb-6" title="Üretilen XML (RSS 2.0 + g: ad alanı)">
        <pre className="max-h-80 overflow-auto rounded-[var(--radius-md)] bg-surface-2 p-3 text-xs" tabIndex={0}>
          {xml}
        </pre>
      </Card>
      <Card title={`Hariç tutulan ürünler (${feed.excluded.length})`}>
        <ul className="divide-y divide-line text-sm">
          {feed.excluded.map((x) => (
            <li key={x.offerId} className="py-2">
              <span className="font-medium text-ink">{x.title ?? x.offerId}</span> <span className="text-xs text-steel">#{x.ref} · {x.offerId}</span>
              <span className="mt-1 block text-xs text-steel">{x.reasons.map((r) => REASON_LABEL[r] ?? r).join(" · ")}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-steel">
          Ayrıntılı nedenler ve düzeltme bağlantıları: <Link href="/admin/merchant" className="underline">Hazırlık panosu</Link>
        </p>
      </Card>
    </>
  );
}
