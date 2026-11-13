/**
 * One-off (client request 13.11.2026): the live TRY prices become USD prices at the TCMB USD selling rate.
 *  - source: every product's LIVE verified price (variant prices too) that is stored in TRY
 *  - rate: the stored TCMB rate the storefront already uses (FxRate USD), or --rate=42.1234 (TCMB ForexSelling)
 *  - amount: exactly the same conversion as the storefront (src/lib/fx/convert.ts), then rounded to whole dollars
 *    (half-up); --cents keeps the cents. A "was" price is converted the same way and dropped if it is no longer higher
 *  - VAT mode / rate are copied unchanged
 *  - a NEW verified price row is written (price history is append-only); the TRY row ends now and stays in history.
 *    Every change gets a price event + audit row ("price.converted_to_usd") with the rate and bulletin date
 * Afterwards non-Turkish pages and the US feed show the USD price as is (no daily conversion); Turkish pages show TRY
 * converted from USD at the daily rate.
 *
 * DRY RUN by default (prints every product, writes nothing):
 *   npx tsx --conditions=react-server scripts/merchant/convert-prices-to-usd.ts --db=neon
 * Write (production endpoint id required):
 *   npx tsx --conditions=react-server scripts/merchant/convert-prices-to-usd.ts --db=neon --apply --confirm-db=<endpoint>
 * Nothing is sent to Google.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { convertMinor, parseRate4 } from "../../src/lib/fx/convert";
import { formatMoney } from "../../src/lib/money";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes("--apply");
const CENTS = process.argv.includes("--cents");
const DB = arg("db") ?? "e2e";
const DATE = "13.11.2026";

/** whole dollars, half-up (minor units) */
const roundDollar = (m: bigint) => (CENTS ? m : ((m + 50n) / 100n) * 100n);

async function main() {
  let url: string;
  if (DB === "e2e") url = testDatabaseUrl("e2e");
  else {
    url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
    const endpoint = new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");
    if (APPLY && arg("confirm-db") !== endpoint) throw new Error(`REFUSED: pass --confirm-db=${endpoint} to write to this database`);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), transactionOptions: { maxWait: 10_000, timeout: 120_000 } });
  try {
    const actor = await db.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    if (!actor) throw new Error("REFUSED: no active SUPER_ADMIN to record as the approver");

    // rate: manual (TCMB) or the stored TCMB rate the storefront uses
    let rate4: number;
    let bulletin: string;
    if (arg("rate")) {
      const r = parseRate4(arg("rate")!);
      if (!r || r < 100_000 || r > 2_000_000) throw new Error("REFUSED: --rate must be the TCMB USD selling rate, e.g. --rate=42.1234");
      rate4 = r;
      bulletin = `elle girilen kur ${DATE}`;
    } else {
      const fx = await db.fxRate.findUnique({ where: { currency: "USD" } });
      if (!fx) throw new Error("REFUSED: no stored TCMB USD rate; pass --rate=<TCMB USD satış kuru>");
      if (Date.now() - +fx.fetchedAt > 3 * 86_400_000) throw new Error(`REFUSED: stored rate is stale (fetched ${fx.fetchedAt.toISOString()}); pass --rate=<TCMB USD satış kuru>`);
      rate4 = fx.rate4;
      bulletin = `TCMB ${fx.bulletinDate}`;
    }
    const rates = { USD: rate4, EUR: 0 };
    const rateText = (rate4 / 10_000).toFixed(4);

    const now = new Date();
    const rows = await db.price.findMany({
      where: { status: "VERIFIED", currency: "TRY", validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }], product: { archivedAt: null } },
      orderBy: { validFrom: "desc" },
      include: { product: { select: { sourceKey: true } } },
    });
    // only the live row per product / variant (the newest)
    const live = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!live.has(`${r.productId}|${r.variantId ?? ""}`)) live.set(`${r.productId}|${r.variantId ?? ""}`, r);

    const plan = [...live.values()].map((p) => {
      const amount = roundDollar(convertMinor(p.amountMinor, "TRY", "USD", rates)!);
      let compareAt = p.compareAtMinor === null ? null : roundDollar(convertMinor(p.compareAtMinor, "TRY", "USD", rates)!);
      if (compareAt !== null && compareAt <= amount) compareAt = null;
      return { p, ref: (p.product.sourceKey ?? p.productId).split(":").pop(), amount, compareAt };
    });
    if (plan.some((x) => x.amount <= 0n)) throw new Error("REFUSED: a converted price is 0");

    console.log(`${APPLY ? "UYGULANIYOR" : "DENEME (hiçbir şey yazılmadı)"} — veritabanı: ${DB}, onaylayan: ${actor.email}`);
    console.log(`Kur: 1 USD = ${rateText} TRY (${bulletin}) · yuvarlama: ${CENTS ? "sent korunur" : "tam dolar"} · ${plan.length} TL fiyat USD'ye çevrilecek`);
    for (const x of plan) console.log(`  #${x.ref}${x.p.variantId ? " (varyant)" : ""}: ${formatMoney(x.p.amountMinor, "TRY", "tr")} → ${formatMoney(x.amount, "USD", "en")}${x.compareAt ? ` (eski ${formatMoney(x.compareAt, "USD", "en")})` : ""}`);
    if (!APPLY || !plan.length) return;

    const evidence = `Müşteri talimatı ${DATE}: TL fiyat ${bulletin} USD satış kuru ${rateText} ile USD'ye çevrildi`;
    await db.$transaction(async (tx) => {
      for (const x of plan) {
        const ended = await tx.price.updateMany({ where: { id: x.p.id, status: "VERIFIED", validTo: x.p.validTo }, data: { validTo: now } });
        if (ended.count !== 1) throw new Error(`REFUSED: price of #${x.ref} changed meanwhile; nothing written`);
        const price = await tx.price.create({
          data: { productId: x.p.productId, variantId: x.p.variantId, currency: "USD", amountMinor: x.amount, compareAtMinor: x.compareAt, vatIncluded: x.p.vatIncluded, vatRateBp: x.p.vatRateBp, validFrom: now, source: "ADMIN", status: "VERIFIED", createdById: actor.id, approvedById: actor.id, approvedAt: now, evidence },
        });
        await tx.priceEvent.create({ data: { priceId: x.p.id, action: "superseded", actorId: actor.id, note: `yerini ${price.id} aldı (USD'ye çevrildi)` } });
        await tx.priceEvent.create({ data: { priceId: price.id, action: "approved", actorId: actor.id, note: evidence } });
        await tx.auditLog.create({
          data: { actorId: actor.id, action: "price.converted_to_usd", entityType: "Price", entityId: price.id, before: { priceId: x.p.id, currency: "TRY", amountMinor: x.p.amountMinor.toString(), compareAtMinor: x.p.compareAtMinor?.toString() ?? null }, after: { productId: x.p.productId, currency: "USD", amountMinor: x.amount.toString(), compareAtMinor: x.compareAt?.toString() ?? null, rate4, bulletin } },
        });
      }
    });
    console.log(`Tamam: ${plan.length} fiyat USD oldu (eski TL kayıtları geçmişte duruyor). Sitede en geç 5 dakikada görünür. Google'a gönderilmedi.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
