/**
 * Google Merchant readiness report — READ ONLY. Uses the same engine as Admin › Merchant (src/lib/merchant) and prints
 * why each product is BLOCKED: global blockers (settings / site) apart from product blockers, with product counts per
 * reason code, plus the raw data distribution behind them. Nothing is written and nothing is sent to Google.
 *
 *   npx tsx scripts/merchant/readiness-report.ts                 # local e2e copy
 *   npx tsx scripts/merchant/readiness-report.ts --db=neon       # production database, read-only transaction mode
 *   ... --json                                                   # machine-readable output
 *   ... --assume-target=US,en,US                                 # SIMULATION: treat the Merchant target as verified
 *                                                                  (nothing is saved) to see the product blockers in that language
 *   ... --export=feed.xml                                        # write the READY items with the existing feed builder to a
 *                                                                  local file (refused together with --assume-target; never uploaded)
 * The environment flags (SITE_INDEXABLE, CATALOG_DATA_VERIFIED, ENABLE_PAID_CHECKOUT ...) come from the current .env,
 * so run it on the server to see exactly what the live admin sees.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { buildFeed, feedXml } from "../../src/lib/merchant/feed";
import { getSiteUrl } from "../../src/lib/seo/site";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { evaluateCatalog, loadFeedSources, loadMerchantContext, targetCurrency, type Evaluated } from "../../src/lib/merchant/facts";
import { evaluateReadiness } from "../../src/lib/merchant/readiness";
import { getRates } from "../../src/lib/fx/rates";
import { GLOBAL_REASONS, REASON_LABEL } from "../../src/lib/merchant/labels";
import { GOOGLE_REQUIRED } from "../../src/lib/merchant/readiness";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DB = arg("db") ?? "e2e";
const JSON_OUT = process.argv.includes("--json");
const ASSUME = arg("assume-target")?.split(",");
const EXPORT = arg("export");
if (EXPORT && ASSUME) throw new Error("--export only from the real (verified) settings, not from a simulation");

function readOnly(url: string) {
  const u = new URL(url);
  u.searchParams.set("options", "-c default_transaction_read_only=on");
  return u.toString();
}

const url = DB === "neon" ? readOnly(process.env.DATABASE_URL || process.env.DIRECT_URL || "") : testDatabaseUrl("e2e");
if (!url) throw new Error("DATABASE_URL not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const r = ASSUME ? await simulate(ASSUME) : await evaluateCatalog(db);
  const all = [...r.candidates, ...r.held.filter((h) => !r.candidates.includes(h))];
  const count = (pick: (e: (typeof all)[number]) => string) => all.reduce<Record<string, number>>((a, e) => ((a[pick(e)] = (a[pick(e)] ?? 0) + 1), a), {});
  const byCode: Record<string, { severity: string; products: number; google: boolean; global: boolean }> = {};
  for (const e of all) for (const x of e.reasons) {
    const b = (byCode[x.code] ??= { severity: x.severity, products: 0, google: GOOGLE_REQUIRED.has(x.code), global: GLOBAL_REASONS.has(x.code) });
    b.products++;
  }
  const onlyProductBlocked = all.filter((e) => e.reasons.some((x) => x.severity === "blocking" && !GLOBAL_REASONS.has(x.code))).length;
  const report = {
    database: DB,
    context: { targetCountry: r.ctx.targetCountry, contentLanguage: r.ctx.contentLanguage, feedLabel: r.ctx.feedLabel, currency: r.ctx.currency, siteIndexable: r.ctx.siteIndexable, catalogVerified: r.ctx.catalogVerified, checkoutOpen: r.ctx.checkoutOpen, shippingVerified: r.ctx.shippingVerified, returnsVerified: r.ctx.returnsVerified, businessVerified: r.ctx.businessVerified },
    totals: { products: all.length, ready: r.ready.length, blocked: all.length - r.ready.length, held: r.held.length, blockedByProductReasons: onlyProductBlocked },
    globalBlockers: Object.entries(byCode).filter(([, v]) => v.global && v.severity === "blocking").map(([k, v]) => ({ code: k, label: REASON_LABEL[k], products: v.products, google: v.google })),
    productReasons: Object.entries(byCode).filter(([, v]) => !v.global).sort((a, b) => b[1].products - a[1].products).map(([k, v]) => ({ code: k, label: REASON_LABEL[k], severity: v.severity, products: v.products, google: v.google })),
    data: {
      priceStatus: count((e) => (e.price ? `${e.price.status}${e.price.converted ? " (kur)" : ""}` : "yok")),
      availability: count((e) => e.availability ?? "kayıt yok"),
      leadTime: count((e) => (e.availability === "MADE_TO_ORDER" ? (e.leadTimeDays ? "MTO + temin süresi" : "MTO, temin süresi yok") : "-")),
      brand: count((e) => (e.brandVerified ? "doğrulanmış" : "doğrulanmamış/yok")),
      identifiers: count((e) => (e.gtin ? "GTIN" : e.mpn ? "MPN" : e.identifierExists === false ? "identifier_exists=no" : "yok")),
      saleMode: count((e) => e.saleMode),
      translation: count((e) => (e.targetTranslationPublished ? "yayında" : "yok/onaysız")),
    },
    products: all.map((e) => ({ ref: e.ref, title: e.title, status: e.status, blocking: e.reasons.filter((x) => x.severity === "blocking" && !GLOBAL_REASONS.has(x.code)).map((x) => x.code), warnings: e.reasons.filter((x) => x.severity === "warning").map((x) => x.code) })),
  };
  if (EXPORT) {
    const feed = buildFeed(r.ready, r.ctx);
    writeFileSync(EXPORT, feedXml(feed.items, { title: "KORNNE", link: getSiteUrl(), generatedAt: new Date() }));
    console.error(`feed: ${feed.items.length} READY ürün → ${EXPORT} (Google'a gönderilmedi)`);
  }
  if (JSON_OUT) console.log(JSON.stringify(report, null, 1));
  else {
    if (ASSUME) console.log("SİMÜLASYON — hedef ayarları teyitli varsayıldı, hiçbir şey kaydedilmedi");
    console.log(`Veritabanı: ${DB}  |  hedef ${report.context.targetCountry ?? "?"}/${report.context.contentLanguage ?? "?"}/${report.context.feedLabel ?? "?"} ${report.context.currency}`);
    console.log(`Ürün ${report.totals.products}  READY ${report.totals.ready}  BLOCKED ${report.totals.blocked}  (ürün kaynaklı engeli olan: ${report.totals.blockedByProductReasons})\n`);
    console.log("GLOBAL ENGELLER (tüm ürünleri durdurur)");
    for (const g of report.globalBlockers) console.log(`  ${g.code.padEnd(30)} ${String(g.products).padStart(3)}  ${g.google ? "Google" : "Kornne iç kural"}  ${g.label}`);
    if (!report.globalBlockers.length) console.log("  yok");
    console.log("\nÜRÜNE ÖZEL");
    for (const p of report.productReasons) console.log(`  ${p.code.padEnd(30)} ${String(p.products).padStart(3)}  ${p.severity === "blocking" ? "ENGEL " : "uyarı "} ${p.google ? "Google" : "Kornne iç kural"}  ${p.label}`);
    console.log("\nVERİ DAĞILIMI");
    for (const [k, v] of Object.entries(report.data)) console.log(`  ${k.padEnd(12)} ${Object.entries(v).map(([a, b]) => `${a}: ${b}`).join(" · ")}`);
  }
}

/** read-only what-if: same engine, the target triple taken from the command line instead of verified settings */
async function simulate([country, lang, label]: string[]) {
  const base = await loadMerchantContext(db);
  const ctx = { ...base, targetCountry: country!.toUpperCase(), contentLanguage: lang!.toLowerCase(), feedLabel: label ?? country!.toUpperCase(), currency: targetCurrency(country!.toUpperCase()) };
  ctx.targetLocaleIsSeo = !process.env.SEO_LOCALES?.trim() || process.env.SEO_LOCALES.split(",").map((x) => x.trim()).includes(ctx.contentLanguage);
  const sources = await loadFeedSources(db, ctx, new Date(), await getRates(db));
  const evaluated: Evaluated[] = sources.map((s) => ({ ...s, ...evaluateReadiness(s, ctx) }));
  const held = evaluated.filter((e) => e.reasons.some((x) => x.code === "PRODUCT_NOT_PUBLIC"));
  const candidates = evaluated.filter((e) => !held.includes(e));
  return { ctx, candidates, held, ready: candidates.filter((e) => e.status === "READY"), byReason: {} };
}

main().finally(() => db.$disconnect());
