/**
 * Redirect health (Admin › Yönlendirmeler, read-only). Finds:
 *  - loops   : following from → to eventually returns to a visited path
 *  - chains  : a target that is itself a redirect source (more than one hop)
 *  - self    : from === to
 */
export type RedirectRow = { fromPath: string; toPath: string; active: boolean };
export type RedirectIssue = { fromPath: string; kind: "loop" | "chain" | "self"; path: string[] };

const norm = (p: string) => (p.length > 1 ? p.replace(/\/$/, "") : p);

export function analyzeRedirects(rows: RedirectRow[]): RedirectIssue[] {
  const map = new Map(rows.filter((r) => r.active).map((r) => [norm(r.fromPath), norm(r.toPath)]));
  const issues: RedirectIssue[] = [];
  for (const [from, to] of map) {
    if (from === to) {
      issues.push({ fromPath: from, kind: "self", path: [from, to] });
      continue;
    }
    if (!map.has(to)) continue;
    const path = [from, to];
    const seen = new Set(path);
    let cur = to;
    let loop = false;
    while (map.has(cur)) {
      cur = map.get(cur)!;
      path.push(cur);
      if (seen.has(cur)) {
        loop = true;
        break;
      }
      seen.add(cur);
      if (path.length > 20) break;
    }
    issues.push({ fromPath: from, kind: loop ? "loop" : "chain", path });
  }
  return issues;
}
