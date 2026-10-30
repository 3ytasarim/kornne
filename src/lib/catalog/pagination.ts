/** Listing page size. scripts/audit/build-redirect-map.mjs uses the same value for legacy /kategori/x/N URLs. */
export const PAGE_SIZE = 24;

export function paginate<T>(items: T[], page: number) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return { pages, page: current, items: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE) };
}
