/** Prints the data-quality queues from the import plan (read-only). Usage: npx tsx scripts/import/report-issues.ts */
import { buildPlan } from "./lib/plan";
import { loadSources } from "./lib/sources";

const plan = buildPlan(loadSources());
const tr = new Map(plan.products.map((p) => [p.sourceKey, p]));
const conflicts = new Map<string, typeof plan.matches>();
for (const m of plan.matches.filter((x) => !x.evidence.priceEqual)) conflicts.set(m.productSourceKey, [...(conflicts.get(m.productSourceKey) ?? []), m]);

console.log("## price conflicts");
for (const [key, ms] of conflicts) {
  const p = tr.get(key)!;
  console.log(`${p.legacyId} | ${p.translation.title} | TR ${p.price?.rawAmount} | ${ms.map((m) => `${m.sourceLocale.toUpperCase()} #${m.sourceLegacyId} ${m.evidence.legacyPrice} (güven ${m.confidence})`).join("; ")}`);
}
console.log("## invalid discounts");
for (const p of plan.products.filter((x) => x.price?.reviewReasons.includes("invalid_discount_compare_at_not_higher"))) console.log(`${p.legacyId} | ${p.translation.title} | ${p.price?.rawAmount} | eski ${p.price?.rawCompareAt}`);
console.log("## missing media");
for (const m of plan.missingMedia) console.log(`${m.url} | ${m.status} | ${m.usages}`);
console.log("## low confidence");
console.log(plan.matches.filter((m) => m.confidence < 60).map((m) => `${m.sourceLocale}#${m.sourceLegacyId}=${m.confidence}`).join(", "));
