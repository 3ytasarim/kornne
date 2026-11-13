/**
 * One-off: applies the client's Merchant decisions of 13.11.2026 to every active product, through the SAME audited
 * service as Admin › Merchant › Toplu onay (src/lib/merchant/review.ts) and the CMS legal approval service.
 *   - brand: "Mezbaha Teknolojileri" (verified)                       — client decision
 *   - stock: In stock, 15 units on hand                               — client decision
 *   - MPN: "MT-<product no>" for products without an MPN or GTIN     — the client is the manufacturer and assigns its
 *     own part numbers with the MT prefix (existing MPNs / GTINs are never overwritten; no GTIN is ever created)
 *   - legal approval of the unapproved LEGAL pages, with the written reference passed in --legal-ref
 *   - settings (client decisions 12.11.2026), saved + VERIFIED through the settings service: Merchant target US / en / US,
 *     legal name "Mezbaha Teknolojileri", shipping rule summary (flat USD 100 abroad). A setting that is already
 *     VERIFIED with a DIFFERENT value is left alone and reported (never overwritten)
 *
 * DRY RUN by default (prints the plan, writes nothing):
 *   npx tsx --conditions=react-server scripts/merchant/apply-client-decisions.ts --db=neon --legal-ref="..."
 * Write (production endpoint id required):
 *   npx tsx --conditions=react-server scripts/merchant/apply-client-decisions.ts --db=neon --legal-ref="..." --apply --confirm-db=<endpoint>
 * Nothing is sent to Google.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { saveSetting, setLegalApproval, verifySetting } from "../../src/lib/cms/service";
import { applyMerchantReview } from "../../src/lib/merchant/review";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const DECISION = { brand: "Mezbaha Teknolojileri", availability: "IN_STOCK" as const, quantity: 15, mpnPrefix: "MT-", date: "13.11.2026" };

const SETTINGS: [string, string][] = [
  ["merchant.targetCountry", "US"],
  ["merchant.contentLanguage", "en"],
  ["merchant.feedLabel", "US"],
  ["company.legalName", "Mezbaha Teknolojileri"],
  ["commerce.shippingPolicy", "Türkiye dışına gönderilen her siparişe sabit 100 USD nakliye ücreti eklenir (ürün sayısından bağımsız); tutar sepette ve ödemede gösterilir. Gümrük vergileri, ithalat masrafları ve varış ülkesi vergileri alıcıya aittir. Ayrıntı: Shipping Policy sayfası (/page/shipping-policy)."],
];

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes("--apply");
const DB = arg("db") ?? "e2e";
const LEGAL_REF = arg("legal-ref")?.trim() ?? "";

async function main() {
  let url: string;
  if (DB === "e2e") url = testDatabaseUrl("e2e");
  else {
    url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
    const endpoint = new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");
    if (APPLY && arg("confirm-db") !== endpoint) throw new Error(`REFUSED: pass --confirm-db=${endpoint} to write to this database`);
  }
  if (LEGAL_REF.length < 5) throw new Error('--legal-ref="<kim, ne zaman onayladı>" gerekli (yasal onay referansı, denetim kaydına yazılır)');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), transactionOptions: { maxWait: 10_000, timeout: 120_000 } });
  try {
    const actor = await db.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
    if (!actor) throw new Error("REFUSED: no active SUPER_ADMIN to record as the approver");

    const products = await db.product.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { sourceKey: "asc" }], select: { id: true, sourceKey: true, mpn: true, gtin: true } });
    const mpn: Record<string, string> = {};
    for (const p of products) if (!p.mpn && !p.gtin) mpn[p.id] = `${DECISION.mpnPrefix}${(p.sourceKey ?? p.id).split(":").pop()}`;
    const dupes = Object.values(mpn).filter((v, i, a) => a.indexOf(v) !== i);
    if (dupes.length) throw new Error(`REFUSED: duplicate MPN ${dupes.join(", ")}`);
    const current = await db.siteSetting.findMany({ where: { key: { in: SETTINGS.map(([k]) => k) } }, select: { key: true, value: true, status: true } });
    const settingPlan = SETTINGS.map(([k, v]) => {
      const c = current.find((x) => x.key === k);
      const same = c && String(c.value ?? "").trim() === v;
      return { key: k, value: v, action: same && c.status === "VERIFIED" ? "zaten doğrulu" : c?.status === "VERIFIED" && !same ? "ATLANDI (farklı değer doğrulanmış)" : "kaydet + doğrula" };
    });
    const legal = await db.page.findMany({ where: { kind: "LEGAL", legalApprovedAt: null }, select: { id: true, key: true } });

    console.log(`${APPLY ? "UYGULANIYOR" : "DENEME (hiçbir şey yazılmadı)"} — veritabanı: ${DB}, onaylayan: ${actor.email}`);
    console.log(`Ürün: ${products.length} · marka "${DECISION.brand}" · stok ${DECISION.availability} ${DECISION.quantity} adet · yeni MPN ${Object.keys(mpn).length} (örn. ${Object.values(mpn).slice(0, 3).join(", ")})`);
    console.log(`Yasal onay: ${legal.length} sayfa (${legal.map((p) => p.key).join(", ") || "yok"}) · referans: ${LEGAL_REF}`);
    for (const p of settingPlan) console.log(`Ayar ${p.key}: ${p.action}`);
    if (!APPLY) return;

    const r = await applyMerchantReview(db, actor, {
      productIds: products.map((p) => p.id),
      availability: DECISION.availability,
      quantity: DECISION.quantity,
      brand: DECISION.brand,
      mpn,
      confirm: true,
      note: `Müşteri kararı ${DECISION.date}: marka ${DECISION.brand}, stokta ${DECISION.quantity} adet, MPN ${DECISION.mpnPrefix}<ürün no>`,
    });
    for (const p of legal) await setLegalApproval(db, actor, p.id, LEGAL_REF);
    for (const p of settingPlan.filter((x) => x.action === "kaydet + doğrula")) {
      await saveSetting(db, actor, p.key, p.value, `Müşteri kararı ${DECISION.date}`);
      await verifySetting(db, actor, p.key, `Müşteri kararı ${DECISION.date}`, true);
    }
    console.log(`Tamam: ${r.changed}/${r.selected} ürün güncellendi, ${r.mpnSet} MPN, marka doğrulandı; ${legal.length} yasal sayfa onaylandı. Sitede en geç 5 dakikada görünür. ${settingPlan.filter((x) => x.action === "kaydet + doğrula").length} ayar doğrulandı. Google'a gönderilmedi.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
