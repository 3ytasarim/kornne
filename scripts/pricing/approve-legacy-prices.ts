/**
 * Approves the 41 legacy kornne.com prices ON THE CLIENT'S EXPLICIT INSTRUCTION (chat, 23.10.2026):
 *   "Fiyatları al" — TL prices as shown on kornne.com (captured 21.10.2026), VAT INCLUDED (20 %), fixed TL
 *   (later changes via Admin › Fiyatlar), old/strike-through prices NOT shown.
 * Per row: sanity check against the captured snapshot (amount must equal the visible TR price) → status VERIFIED,
 * vatIncluded=true, vatRateBp=2000, compareAtMinor=null (raw old price kept in rawCompareAt for history),
 * approvedAt, note + PriceEvent + one AuditLog entry. One transaction; idempotent (already VERIFIED rows untouched).
 *
 *   npx tsx scripts/pricing/approve-legacy-prices.ts                                  # dry run (Neon, read-only)
 *   npx tsx scripts/pricing/approve-legacy-prices.ts --db=e2e --apply                 # local test copy
 *   npx tsx scripts/pricing/approve-legacy-prices.ts --apply --confirm-db=<endpoint>  # Neon (endpoint id required)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import catalog from "../../src/data/source-snapshot/catalog.json";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes("--apply");
const DB = arg("db") ?? "neon";
const NOTE = "Müşteri talimatı 23.10.2026 (yazılı): kornne.com TL fiyatı (21.10.2026), KDV dahil %20, sabit TL; eski/üstü çizili fiyat gösterilmez";

async function main() {
  let url: string;
  if (DB === "e2e") url = testDatabaseUrl("e2e");
  else {
    url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
    const endpoint = new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");
    if (APPLY && arg("confirm-db") !== endpoint) throw new Error(`REFUSED: pass --confirm-db=${endpoint} to write to this database`);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), transactionOptions: { maxWait: 10_000, timeout: 60_000 } });
  const snapshot = new Map((catalog.products as { source_id: string; locale: string; price: string | null }[]).filter((p) => p.locale === "tr").map((p) => [`kornne.com:${p.source_id}`, p.price]));
  const rows = await db.price.findMany({ where: { source: "LEGACY_IMPORT", variantId: null }, include: { product: { select: { sourceKey: true, translations: { where: { locale: "tr" }, select: { title: true } } } } }, orderBy: { product: { sourceKey: "asc" } } });
  const plan: { id: string; ref: string; title: string; amount: string; status: string; ok: boolean; why?: string }[] = [];
  for (const r of rows) {
    const snap = snapshot.get(r.product.sourceKey ?? "");
    const expected = snap ? BigInt(Math.round(Number(snap) * 100)) : null;
    const ok = expected !== null && expected === r.amountMinor && r.amountMinor > 0n && r.currency === "TRY";
    plan.push({ id: r.id, ref: (r.product.sourceKey ?? "").split(":").pop()!, title: r.product.translations[0]?.title ?? "", amount: (Number(r.amountMinor) / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 }), status: r.status, ok, why: ok ? undefined : `snapshot ${snap} ≠ ${r.amountMinor}` });
  }
  const todo = plan.filter((p) => p.ok && p.status === "UNVERIFIED");
  console.log(`rows ${rows.length} · approvable ${todo.length} · already verified ${plan.filter((p) => p.status === "VERIFIED").length} · mismatches ${plan.filter((p) => !p.ok).length}`);
  for (const p of plan) console.log(`${p.ok ? "  " : "!!"} #${p.ref.padEnd(4)} ${p.amount.padStart(16)} TL  ${p.status.padEnd(10)} ${p.title}${p.why ? "  ← " + p.why : ""}`);
  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Add --apply (and --confirm-db for Neon).");
    await db.$disconnect();
    return;
  }
  if (plan.some((p) => !p.ok)) throw new Error("REFUSED: snapshot mismatches — review first");
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const p of todo) {
      const claimed = await tx.price.updateMany({ where: { id: p.id, status: "UNVERIFIED" }, data: { status: "VERIFIED", vatIncluded: true, vatRateBp: 2000, compareAtMinor: null, approvedAt: now, note: NOTE } });
      if (claimed.count !== 1) throw new Error(`price ${p.id} changed concurrently`);
      await tx.priceEvent.create({ data: { priceId: p.id, action: "approved_by_client_instruction", note: NOTE } });
    }
    await tx.auditLog.create({ data: { action: "price.bulk_approved_by_client_instruction", entityType: "Price", after: { count: todo.length, vatIncluded: true, vatRateBp: 2000, compareAtShown: false, note: NOTE } } });
  });
  console.log(`\nAPPLIED: ${todo.length} prices VERIFIED (KDV dahil %20).`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message.split("\n")[0] : e);
  process.exit(1);
});
