// Release gate (Sprint 11): every migration must be ADDITIVE (expand/contract). Destructive statements are refused
// unless the migration folder is listed in prisma/destructive-approved.txt (written approval + backup + plan).
//   node scripts/release/check-migrations.mjs        → exit 1 on a destructive, unapproved migration
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DESTRUCTIVE = [/\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|INDEX)\b/i, /\bTRUNCATE\b/i, /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, /\bDELETE\s+FROM\b/i, /\bRENAME\s+(COLUMN|TO)\b/i, /\bSET\s+NOT\s+NULL\b/i];

export function scanMigrations(dir = "prisma/migrations") {
  const approved = existsSync("prisma/destructive-approved.txt") ? readFileSync("prisma/destructive-approved.txt", "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  const out = [];
  for (const m of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const sql = readFileSync(join(dir, m, "migration.sql"), "utf8").replace(/--.*$/gm, "");
    const hits = DESTRUCTIVE.filter((re) => re.test(sql)).map((re) => re.source);
    out.push({ migration: m, destructive: hits, approved: approved.includes(m) });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("check-migrations.mjs")) {
  const res = scanMigrations();
  const bad = res.filter((r) => r.destructive.length && !r.approved);
  for (const r of res) console.log(`${r.destructive.length ? (r.approved ? "APPROVED " : "REFUSED  ") : "additive "} ${r.migration}${r.destructive.length ? " → " + r.destructive.join(", ") : ""}`);
  process.exit(bad.length ? 1 : 0);
}
