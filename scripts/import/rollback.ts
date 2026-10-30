/**
 * Undo ONE importer run: deletes exactly the rows that run created (ImportRun.createdRefs), in reverse dependency
 * order, inside one transaction. Rows created later by admins are untouched. Updates are not reverted (the run report
 * lists them). Dry run by default.
 *
 *   npm run import:rollback -- --run=<importRunId>                                  # shows what would be deleted
 *   npm run import:rollback -- --run=<importRunId> --apply --confirm-db=<endpoint>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const argv = process.argv.slice(2);
const runId = argv.find((a) => a.startsWith("--run="))?.split("=")[1];
const apply = argv.includes("--apply");
const confirm = argv.find((a) => a.startsWith("--confirm-db="))?.split("=")[1];
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL!;
const endpoint = new URL(dbUrl).host.split(".")[0]!.replace(/-pooler$/, "");
if (!runId) throw new Error("--run=<ImportRun id> is required");
if (apply && confirm !== endpoint) {
  console.error(`Refusing: pass --confirm-db=${endpoint}`);
  process.exit(2);
}

type Ref = string | { productId: string; categoryId?: string; mediaId?: string };

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  try {
    const run = await prisma.importRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== "APPLIED") throw new Error(`run ${runId} has status ${run.status}`);
    const refs = (run.createdRefs ?? {}) as Record<string, Ref[]>;
    const ids = (k: string) => (refs[k] ?? []).filter((r): r is string => typeof r === "string");
    const plan = Object.fromEntries(Object.entries(refs).map(([k, v]) => [k, v.length]));
    console.log(JSON.stringify({ runId, mode: apply ? "apply" : "dry-run", toDelete: plan }, null, 1));
    if (!apply) return;
    await prisma.$transaction(
      async (tx) => {
        await tx.redirect.deleteMany({ where: { id: { in: ids("redirect") }, source: "LEGACY_AUDIT" } });
        await tx.legacyMatchSuggestion.deleteMany({ where: { id: { in: ids("matchSuggestion") } } });
        await tx.legacySourceRecord.deleteMany({ where: { id: { in: ids("legacySourceRecord") } } });
        await tx.inventory.deleteMany({ where: { id: { in: ids("inventory") } } });
        await tx.price.deleteMany({ where: { id: { in: ids("price") } } });
        await tx.productVariant.deleteMany({ where: { id: { in: ids("variant") } } });
        await tx.mediaTranslation.deleteMany({ where: { id: { in: ids("mediaTranslation") } } });
        for (const r of (refs.productMedia ?? []) as { productId: string; mediaId: string }[]) await tx.productMedia.deleteMany({ where: r });
        for (const r of (refs.productCategory ?? []) as { productId: string; categoryId: string }[]) await tx.productCategory.deleteMany({ where: r });
        await tx.productTranslation.deleteMany({ where: { id: { in: ids("productTranslation") } } });
        await tx.product.deleteMany({ where: { id: { in: ids("product") } } });
        await tx.mediaAsset.deleteMany({ where: { id: { in: ids("mediaAsset") } } });
        await tx.categoryTranslation.deleteMany({ where: { id: { in: ids("categoryTranslation") } } });
        await tx.category.deleteMany({ where: { id: { in: ids("category") } } });
        await tx.importRun.update({ where: { id: runId }, data: { status: "ROLLED_BACK", finishedAt: new Date() } });
      },
      { timeout: 300_000, maxWait: 30_000 },
    );
    console.log("rolled back");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
