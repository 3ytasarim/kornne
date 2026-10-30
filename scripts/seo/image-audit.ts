/**
 * Image SEO / Merchant image audit (Sprint 8) — READ-ONLY. Never rewrites or renames an original.
 *   npx tsx scripts/seo/image-audit.ts --db=neon   # real data, read-only session (default_transaction_read_only)
 *   npx tsx scripts/seo/image-audit.ts --db=e2e    # local disposable copy
 * Output: data/qa-logs/image-audit.json (+ console summary)
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { analyzeImages, brokenFromInventory, loadImageRows, verifyFiles } from "../../src/lib/seo/image-audit";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

function dbUrl(kind: string) {
  if (kind !== "neon") return testDatabaseUrl("e2e");
  const u = new URL(process.env.DATABASE_URL ?? "");
  u.searchParams.set("options", "-c default_transaction_read_only=on");
  return u.toString();
}

async function main() {
  const kind = process.argv.find((a) => a.startsWith("--db="))?.slice(5) ?? "neon";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl(kind) }) });
  const rows = await loadImageRows(db);
  await db.$disconnect();
  const { items, summary } = analyzeImages(rows);
  const files = verifyFiles(rows);
  const broken = brokenFromInventory(readFileSync("docs/audit/media-inventory.csv", "utf8"));
  const mainBelow500 = items.filter((i) => i.isMainOfPublic && (i.merchant === "BELOW_2027" || i.merchant === "BELOW_NOW")).map((i) => ({ file: i.fileName, dims: `${i.width}×${i.height}`, products: i.usedBy.filter((u) => u.isMain && u.public).map((u) => `#${u.productRef} ${u.productTitle}`) }));
  const byCode: Record<string, number> = {};
  for (const i of items) for (const x of i.issues) byCode[x.code] = (byCode[x.code] ?? 0) + 1;
  const mimes: Record<string, number> = {};
  for (const i of items) mimes[i.mime] = (mimes[i.mime] ?? 0) + 1;
  const report = { db: kind, at: new Date().toISOString(), summary, files: { ...files, servedMismatch: files.servedMismatch.length, originalMismatch: files.originalMismatch.length, missing: files.missing.length }, broken, mainBelow500, byCode, mimes, suspect: items.filter((i) => i.issues.some((x) => x.code === "filename-suspect")).map((i) => i.fileName), items: items.map((i) => ({ path: i.publicPath, w: i.width, h: i.height, mime: i.mime, bytes: i.bytes, main: i.isMainOfPublic, merchant: i.merchant, alt: i.altLocales, dups: i.duplicates.length, issues: i.issues.map((x) => x.code) })) };
  mkdirSync("data/qa-logs", { recursive: true });
  writeFileSync("data/qa-logs/image-audit.json", JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ db: kind, summary, files: report.files, broken: broken.length, mimes, byCode }, null, 1));
  console.log("Ana görsel < 500 px:");
  for (const m of mainBelow500) console.log(`  ${m.dims}  ${m.file}  ← ${m.products.join("; ")}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(2);
});
