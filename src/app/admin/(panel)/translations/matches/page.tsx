import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader, StatCard } from "@/components/admin/PageHeader";
import { TRANSLATION_NAV } from "@/components/admin/subnavs";
import { FilterBar, FilterSelect, ModuleState, SubNav } from "@/components/admin/ui";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { Notice } from "@/components/ui/States";
import { fmtDateTime, strParam } from "@/lib/admin/format";
import { LOW_CONFIDENCE, matchRequirements } from "@/lib/admin/translations";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";

export const metadata = { title: "Eşleşme önerileri" };
type Evidence = { legacyTitle?: string; trTitle?: string; sharedImages?: number; legacyImages?: number; priceEqual?: boolean };
const STATUS = { SUGGESTED: ["Karar bekliyor", "brand"], APPROVED: ["Onaylandı", "success"], REJECTED: ["Reddedildi", "outline"] } as const;

export default async function MatchesPage({ searchParams }: PageProps<"/admin/translations/matches">) {
  await requireAdmin("translations");
  const sp = await searchParams;
  const dil = strParam(sp.dil);
  const durum = strParam(sp.durum);
  const risk = strParam(sp.risk);
  const where: Prisma.LegacyMatchSuggestionWhereInput = {};
  if (dil === "en" || dil === "fr") where.sourceLocale = dil;
  if (durum === "SUGGESTED" || durum === "APPROVED" || durum === "REJECTED") where.status = durum;
  if (risk === "dusuk") where.confidence = { lt: LOW_CONFIDENCE };
  const db = requireDb();
  const [rows, all] = await Promise.all([
    db.legacyMatchSuggestion.findMany({ where, orderBy: [{ status: "asc" }, { confidence: "asc" }], include: { product: { select: { translations: { select: { locale: true, status: true } } } } } }),
    db.legacyMatchSuggestion.findMany({ select: { status: true, confidence: true, evidence: true } }),
  ]);
  const filtered = risk === "celiski" ? rows.filter((r) => matchRequirements(r).priceConflict) : risk === "musteri" ? rows.filter((r) => matchRequirements(r).customerDecision) : rows;
  return (
    <>
      <PageHeader title="EN/FR eşleşme önerileri" description="Eski sitedeki ayrı İngilizce/Fransızca ürün kayıtlarının Türkçe ürünle ilişkisi. Hiçbiri otomatik onaylanmaz; onay yalnız editör taslağı oluşturur, yayın ayrı adımdır." actions={<ModuleState state="live" />} />
      <SubNav items={TRANSLATION_NAV} current="/admin/translations/matches" />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Toplam öneri" value={all.length} hint="36 EN + 38 FR" />
        <StatCard label="Karar bekliyor" value={all.filter((m) => m.status === "SUGGESTED").length} />
        <StatCard label="Düşük güven (<60)" value={all.filter((m) => m.confidence < LOW_CONFIDENCE).length} tone="warning" />
        <StatCard label="Fiyat çelişkili" value={all.filter((m) => (m.evidence as Evidence).priceEqual === false).length} tone="warning" hint="fiyat alınmaz" />
        <StatCard label="Onay / ret" value={`${all.filter((m) => m.status === "APPROVED").length} / ${all.filter((m) => m.status === "REJECTED").length}`} />
      </div>
      <Notice className="mb-6">“Kurban Yatırma Kabini” eşleşmeleri (EN #142, FR #179) müşteri kararı gerektirir: ortak görsel yok ve fiyatlar çok farklı. Onay için müşteri onayı referansı istenir.</Notice>
      <FilterBar action="/admin/translations/matches" resetHref="/admin/translations/matches" label="Eşleşme filtreleri">
        <FilterSelect name="dil" label="Dil" value={dil} options={[["", "EN + FR"], ["en", "İngilizce"], ["fr", "Fransızca"]]} />
        <FilterSelect name="durum" label="Durum" value={durum} options={[["", "Tümü"], ["SUGGESTED", "Karar bekliyor"], ["APPROVED", "Onaylandı"], ["REJECTED", "Reddedildi"]]} />
        <FilterSelect name="risk" label="Risk" value={risk} options={[["", "Tümü"], ["dusuk", "Düşük güven"], ["celiski", "Fiyat çelişkisi"], ["musteri", "Müşteri kararı gerekli"]]} />
      </FilterBar>
      <DataTable
        caption="Eşleşme önerileri"
        rows={filtered}
        rowKey={(m) => m.id}
        empty="Eşleşen öneri yok."
        columns={[
          { key: "l", header: "Dil", cell: (m) => m.sourceLocale.toUpperCase() },
          { key: "s", header: "Eski kayıt", cell: (m) => <Link href={`/admin/translations/matches/${m.id}`} lang={m.sourceLocale} className="font-semibold text-brand-700 hover:underline dark:text-brand-300">#{m.sourceLegacyId} {(m.evidence as Evidence).legacyTitle}</Link> },
          { key: "t", header: "Önerilen TR ürün", cell: (m) => (m.evidence as Evidence).trTitle },
          {
            key: "c",
            header: "Güven",
            cell: (m) => {
              const r = matchRequirements(m);
              return (
                <div className="flex flex-wrap gap-1">
                  <Badge tone={m.confidence >= 85 ? "success" : m.confidence >= LOW_CONFIDENCE ? "warning" : "signal"}>{m.confidence}</Badge>
                  {r.priceConflict ? <Badge tone="outline">fiyat ≠</Badge> : null}
                  {r.customerDecision ? <Badge tone="warning">müşteri kararı</Badge> : null}
                </div>
              );
            },
          },
          { key: "g", header: "Ortak görsel", cell: (m) => `${(m.evidence as Evidence).sharedImages ?? 0}/${(m.evidence as Evidence).legacyImages ?? 0}` },
          { key: "d", header: "Durum", cell: (m) => <Badge tone={STATUS[m.status][1]}>{STATUS[m.status][0]}</Badge> },
          { key: "x", header: "Karar", cell: (m) => (m.decidedAt ? <span className="text-xs text-steel">{fmtDateTime(m.decidedAt)}</span> : "—") },
        ]}
      />
    </>
  );
}
