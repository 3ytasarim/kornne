/**
 * Technical SEO audit CLI (Sprint 8). Fetches every URL of the DB-built inventory from a RUNNING local server and
 * writes a per-URL report. Never contacts Google or any external host: the base URL must be localhost.
 *
 *   npx tsx scripts/seo/audit.ts --base=http://localhost:3470 --mode=dev       # isolated e2e server (noindex env)
 *   npx tsx scripts/seo/audit.ts --base=http://localhost:3471 --mode=prodlike  # offline production-like preview
 *   options: --db=e2e (default, local copy the server uses) | --db=neon (read-only session) · --seo-locales=tr
 *            --out=data/qa-logs/seo-audit-<mode>.json
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runSeoAudit, type AuditMode } from "../../src/lib/seo/audit";
import { buildInventory } from "../../src/lib/seo/inventory";
import { isEnabledLocale, type Locale } from "../../src/lib/i18n/config";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const arg = (k: string, d?: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = arg("base", "http://localhost:3470")!.replace(/\/+$/, "");
const mode = arg("mode", "dev") as AuditMode;
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("REFUSED: the SEO audit only runs against a local server");
if (mode !== "dev" && mode !== "prodlike") throw new Error("--mode must be dev|prodlike");
const picked = arg("seo-locales", "tr")!.split(",").filter(isEnabledLocale) as Locale[];
const seoLocales: Locale[] = picked.length ? picked : ["tr"];

const dbKind = arg("db", "e2e");
let url: string;
if (dbKind === "neon") {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL missing");
  const u = new URL(raw);
  u.searchParams.set("options", "-c default_transaction_read_only=on");
  url = u.toString();
} else url = testDatabaseUrl("e2e");

async function main() {
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const inventory = await buildInventory(db, { seoLocales, verified: mode === "prodlike" });
await db.$disconnect();

const report = await runSeoAudit({ base, mode, inventory, concurrency: 6 });
const out = arg("out", `data/qa-logs/seo-audit-${mode}.json`)!;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 1));

const s = report.summary;
console.log(`SEO audit ${mode} @ ${base}: ${s.urls} URL · ${s.errors} hata · ${s.warnings} uyarı · sitemap ${report.sitemap.urlCount} URL / ${report.sitemap.imageCount} görsel`);
console.log("Türlere göre:", JSON.stringify(s.byKind));
console.log("Bulgu kodları:", JSON.stringify(s.byCode));
const errs = [...report.pages.flatMap((p) => p.findings.filter((f) => f.severity === "error").map((f) => `${p.path} · ${f.code} · ${f.message}`)), ...report.sitemap.findings.filter((f) => f.severity === "error").map((f) => `sitemap · ${f.code} · ${f.message}`), ...report.robots.filter((f) => f.severity === "error").map((f) => `robots · ${f.code} · ${f.message}`)];
for (const e of errs.slice(0, 40)) console.log("  ✗", e);
if (errs.length > 40) console.log(`  … +${errs.length - 40}`);
console.log(`Rapor: ${out}`);
process.exitCode = errs.length ? 1 : 0;
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
