import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { FilterBar, FilterSearch, FilterSelect, ModuleState, Pagination } from "@/components/admin/ui";
import { fmtDateTime, pageParam, strParam } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/guard";
import { requireDb } from "@/lib/db";

export const metadata = { title: "Denetim kaydı" };
const PER_PAGE = 50;

/** Audit log viewer. Snapshots are redacted at write time (no secrets / password hashes / PII in quote audits). */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin("audit");
  const sp = await searchParams;
  const action = strParam(sp.islem, 60);
  const entity = strParam(sp.nesne, 40);
  const actor = strParam(sp.kisi, 40);
  const page = pageParam(sp.sayfa);
  const db = requireDb();
  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = { startsWith: action };
  if (entity) where.entityType = entity;
  if (actor) where.actorId = actor;
  const [rows, total, entities, users] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE, include: { actor: { select: { name: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entityType"], _count: true }),
    db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const params = new URLSearchParams(Object.entries({ islem: action, nesne: entity, kisi: actor }).filter(([, v]) => v));
  return (
    <>
      <PageHeader title="Denetim kaydı" description="Giriş/çıkış, yetkisiz deneme, ürün, fiyat, teklif, içerik, kullanıcı ve ayar işlemleri. Kayıtlar değiştirilemez." actions={<ModuleState state="live" />} />
      <FilterBar action="/admin/audit" resetHref="/admin/audit" label="Denetim filtreleri">
        <FilterSearch name="islem" label="İşlem (başlangıç)" value={action} placeholder="price. · quote. · auth.denied" />
        <FilterSelect name="nesne" label="Nesne" value={entity} options={[["", "Tümü"], ...entities.map((e) => [e.entityType, `${e.entityType} (${e._count})`] as [string, string])]} />
        <FilterSelect name="kisi" label="Kişi" value={actor} options={[["", "Herkes"], ...users.map((u) => [u.id, u.name] as [string, string])]} />
      </FilterBar>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface" tabIndex={0} role="region" aria-label="Kaydırılabilir tablo">
        <table className="w-full min-w-[48rem] text-sm">
          <caption className="sr-only">Denetim kaydı</caption>
          <thead className="bg-surface-2 text-xs text-steel uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 text-start">Zaman</th>
              <th scope="col" className="px-4 py-3 text-start">Kişi</th>
              <th scope="col" className="px-4 py-3 text-start">İşlem</th>
              <th scope="col" className="px-4 py-3 text-start">Nesne</th>
              <th scope="col" className="px-4 py-3 text-start">Ayrıntı</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-steel">
                  Kayıt yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-steel">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-4 py-3">{r.actor?.name ?? <span className="text-steel">sistem / anonim</span>}</td>
                  <td className="px-4 py-3">
                    <code className="text-xs font-semibold">{r.action}</code>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.entityType}
                    {r.entityId ? <span className="block text-steel">{r.entityId}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.before || r.after ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-brand-700 dark:text-brand-300">Göster</summary>
                        <div className="mt-2 grid gap-2">
                          {r.before ? <pre className="max-w-xl overflow-x-auto rounded bg-surface-2 p-2 text-[11px]" tabIndex={0}>önce: {JSON.stringify(r.before, null, 1)}</pre> : null}
                          {r.after ? <pre className="max-w-xl overflow-x-auto rounded bg-surface-2 p-2 text-[11px]" tabIndex={0}>sonra: {JSON.stringify(r.after, null, 1)}</pre> : null}
                        </div>
                      </details>
                    ) : (
                      <span className="text-xs text-steel">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={Math.min(page, pages)} pages={pages} total={total} href={(p) => `/admin/audit?${new URLSearchParams([...params, ...(p > 1 ? [["sayfa", String(p)]] : [])])}`} />
    </>
  );
}
