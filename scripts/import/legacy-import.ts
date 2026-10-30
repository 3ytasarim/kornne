/**
 * Legacy kornne.com → KORNNE database importer. Runbook: docs/data-migration/import-runbook.md
 *
 *   npm run import:legacy                         # DRY RUN (default): reads the DB, writes NOTHING
 *   npm run import:legacy -- --apply --confirm-db=<endpoint-id>
 *
 * Guarantees
 *  - Idempotent: natural keys (Product.sourceKey, Category.key, MediaAsset.storageKey, LegacySourceRecord
 *    (entityType, legacyId, locale), LegacyMatchSuggestion (locale, legacyId), Redirect.fromPath, composite link keys).
 *    A second run creates nothing.
 *  - Never overwrites human edits: translations/alt texts are updated only while their stored importChecksum still
 *    matches the row (i.e. nobody edited it); products/prices/redirects owned by an admin are never touched.
 *  - Prices are append-only and always UNVERIFIED.
 *  - Single interactive transaction on the DIRECT (non-pooled) connection; the ImportRun row records counts and the
 *    ids of every created row → scripts/import/rollback.ts can undo exactly that run.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient, type Locale } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { altChecksum, buildPlan, categoryTranslationChecksum, planChecks, translationChecksum, type Plan } from "./lib/plan";
import { loadSources, ROOT } from "./lib/sources";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const confirm = [...args].find((a) => a.startsWith("--confirm-db="))?.split("=")[1];
const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!dbUrl) throw new Error("DIRECT_URL / DATABASE_URL not set");
const endpoint = new URL(dbUrl).host.split(".")[0]!.replace(/-pooler$/, "");
if (apply && confirm !== endpoint) {
  console.error(`Refusing to apply: pass --confirm-db=${endpoint} to confirm the target database.`);
  process.exit(2);
}

type Counter = { create: number; update: number; unchanged: number; skippedEdited: number; conflict: number };
const newCounter = (): Counter => ({ create: 0, update: 0, unchanged: 0, skippedEdited: 0, conflict: 0 });

async function counts(db: PrismaClient | Prisma.TransactionClient) {
  const [products, productTranslations, categories, categoryTranslations, productCategories, mediaAssets, mediaTranslations, productMedia, variants, prices, inventory, legacyRecords, matchSuggestions, redirects] = await Promise.all([
    db.product.count(),
    db.productTranslation.count(),
    db.category.count(),
    db.categoryTranslation.count(),
    db.productCategory.count(),
    db.mediaAsset.count(),
    db.mediaTranslation.count(),
    db.productMedia.count(),
    db.productVariant.count(),
    db.price.count(),
    db.inventory.count(),
    db.legacySourceRecord.count(),
    db.legacyMatchSuggestion.count(),
    db.redirect.count(),
  ]);
  return { products, productTranslations, categories, categoryTranslations, productCategories, mediaAssets, mediaTranslations, productMedia, variants, prices, inventory, legacyRecords, matchSuggestions, redirects };
}

type Created = Record<string, unknown[]>;

async function run(tx: Prisma.TransactionClient, plan: Plan, write: boolean) {
  const c: Record<string, Counter> = {};
  const created: Created = {};
  const notes: string[] = [];
  const bump = (k: string, f: keyof Counter) => ((c[k] ??= newCounter())[f]++);
  const track = (k: string, ref: unknown) => (created[k] ??= []).push(ref);

  // ── categories ──
  const catId = new Map<string, string>();
  for (const cat of plan.categories) {
    let row = await tx.category.findUnique({ where: { key: cat.key }, include: { translations: true } });
    if (!row) {
      bump("category", "create");
      if (write) {
        row = await tx.category.create({ data: { key: cat.key, isAllProducts: cat.isAllProducts, sortOrder: cat.sortOrder, status: "PUBLISHED" }, include: { translations: true } });
        track("category", row.id);
      }
    } else bump("category", "unchanged");
    if (row) catId.set(cat.key, row.id);
    for (const t of cat.translations) {
      const ex = row?.translations.find((x) => x.locale === t.locale);
      if (!ex) {
        bump("categoryTranslation", "create");
        if (write && row) track("categoryTranslation", (await tx.categoryTranslation.create({ data: { categoryId: row.id, locale: t.locale as Locale, name: t.name, slug: t.slug, status: t.status, importChecksum: t.checksum } })).id);
      } else if (ex.importChecksum === t.checksum) bump("categoryTranslation", "unchanged");
      else if (ex.importChecksum !== categoryTranslationChecksum({ name: ex.name, slug: ex.slug, description: ex.description })) bump("categoryTranslation", "skippedEdited");
      else {
        bump("categoryTranslation", "update");
        if (write) await tx.categoryTranslation.update({ where: { id: ex.id }, data: { name: t.name, slug: t.slug, importChecksum: t.checksum } });
      }
    }
  }

  // ── media assets ──
  const mediaId = new Map<string, string>();
  const existingMedia = new Map((await tx.mediaAsset.findMany({ select: { id: true, storageKey: true, publicPath: true, sha256: true } })).map((m) => [m.storageKey, m]));
  const toCreate = plan.mediaAssets.filter((m) => !existingMedia.has(m.storageKey));
  for (const m of plan.mediaAssets) {
    const ex = existingMedia.get(m.storageKey);
    if (!ex) continue;
    mediaId.set(m.publicPath, ex.id);
    if (ex.sha256 !== m.sha256) {
      bump("mediaAsset", "conflict");
      notes.push(`media ${m.storageKey}: stored sha256 differs from source — not overwritten`);
    } else bump("mediaAsset", "unchanged");
  }
  c.mediaAsset = { ...(c.mediaAsset ?? newCounter()), create: toCreate.length };
  if (write && toCreate.length) {
    const rows = await tx.mediaAsset.createManyAndReturn({ data: toCreate, select: { id: true, publicPath: true } });
    rows.forEach((r) => (mediaId.set(r.publicPath, r.id), track("mediaAsset", r.id)));
  }

  // ── products ──
  for (const p of plan.products) {
    let prod = await tx.product.findUnique({ where: { sourceKey: p.sourceKey }, include: { translations: true, categories: true, media: true, variants: true, prices: true, inventory: true } });
    if (!prod) {
      bump("product", "create");
      if (write) {
        prod = await tx.product.create({
          data: { sourceKey: p.sourceKey, status: p.status, needsReview: p.needsReview, reviewReasons: p.reviewReasons, sortOrder: p.sortOrder, verificationStatus: "UNVERIFIED" },
          include: { translations: true, categories: true, media: true, variants: true, prices: true, inventory: true },
        });
        track("product", prod.id);
      }
    } else bump("product", "unchanged"); // status/visibility belong to editors after the first import

    // translation (tr)
    const t = p.translation;
    const ex = prod?.translations.find((x) => x.locale === "tr");
    if (!ex) {
      bump("productTranslation", "create");
      if (write && prod) track("productTranslation", (await tx.productTranslation.create({ data: { productId: prod.id, locale: "tr", title: t.title, slug: t.slug, descriptionHtml: t.descriptionHtml, status: t.status, importChecksum: t.checksum, legacyRecordId: `product:${p.legacyId}:tr` } })).id);
    } else if (ex.importChecksum === t.checksum) bump("productTranslation", "unchanged");
    else if (ex.importChecksum !== translationChecksum(ex)) bump("productTranslation", "skippedEdited");
    else {
      bump("productTranslation", "update");
      if (write) await tx.productTranslation.update({ where: { id: ex.id }, data: { title: t.title, slug: t.slug, descriptionHtml: t.descriptionHtml, importChecksum: t.checksum } });
    }

    // categories (links are only added, never removed)
    for (const pc of p.categories) {
      const cid = catId.get(pc.key);
      if (prod?.categories.some((x) => x.categoryId === cid)) bump("productCategory", "unchanged");
      else {
        bump("productCategory", "create");
        if (write && prod && cid) {
          await tx.productCategory.create({ data: { productId: prod.id, categoryId: cid, isPrimary: pc.isPrimary, sortOrder: pc.sortOrder } });
          track("productCategory", { productId: prod.id, categoryId: cid });
        }
      }
    }

    // media links + TR alt text (auto-generated draft)
    for (const img of p.images) {
      const mid = mediaId.get(img.publicPath);
      if (!mid && write) {
        bump("productMedia", "conflict");
        notes.push(`product ${p.legacyId}: media ${img.publicPath} not found`);
        continue;
      }
      if (prod?.media.some((x) => x.mediaId === mid)) bump("productMedia", "unchanged");
      else {
        bump("productMedia", "create");
        if (write && prod && mid) {
          await tx.productMedia.create({ data: { productId: prod.id, mediaId: mid, sortOrder: img.sortOrder, isPrimary: img.isPrimary } });
          track("productMedia", { productId: prod.id, mediaId: mid });
        }
      }
      const exAlt = mid ? await tx.mediaTranslation.findUnique({ where: { mediaId_locale: { mediaId: mid, locale: "tr" } } }) : null;
      const sum = altChecksum(img.alt);
      if (!exAlt) {
        bump("mediaTranslation", "create");
        if (write && mid) track("mediaTranslation", (await tx.mediaTranslation.create({ data: { mediaId: mid, locale: "tr", alt: img.alt, autoGenerated: true, importChecksum: sum } })).id);
      } else if (exAlt.importChecksum === sum) bump("mediaTranslation", "unchanged");
      else if (exAlt.importChecksum !== altChecksum(exAlt.alt)) bump("mediaTranslation", "skippedEdited");
      else bump("mediaTranslation", "unchanged"); // same media shared by two products keeps the first alt
    }

    // variants (#107 only)
    for (const v of p.variants) {
      if (prod?.variants.some((x) => x.sourceKey === v.sourceKey)) bump("variant", "unchanged");
      else {
        bump("variant", "create");
        if (write && prod) track("variant", (await tx.productVariant.create({ data: { productId: prod.id, sourceKey: v.sourceKey, labels: v.labels, sortOrder: v.sortOrder } })).id);
      }
    }

    // price: append-only, UNVERIFIED; never added when an admin already priced the product
    if (p.price) {
      const legacy = prod?.prices.filter((x) => x.source === "LEGACY_IMPORT").sort((a, b) => +b.createdAt - +a.createdAt)[0];
      const adminOwned = prod?.prices.some((x) => x.source !== "LEGACY_IMPORT");
      if (adminOwned) bump("price", "skippedEdited");
      else if (legacy && legacy.rawAmount === p.price.rawAmount && legacy.rawCompareAt === p.price.rawCompareAt) bump("price", "unchanged");
      else {
        bump("price", legacy ? "update" : "create");
        if (write && prod) {
          const row = await tx.price.create({
            data: { productId: prod.id, currency: "TRY", amountMinor: p.price.amountMinor, compareAtMinor: p.price.compareAtMinor, source: "LEGACY_IMPORT", status: "UNVERIFIED", rawAmount: p.price.rawAmount, rawCompareAt: p.price.rawCompareAt, sourceLocale: "tr", reviewReasons: p.price.reviewReasons },
          });
          track("price", row.id);
        }
      }
    }

    // inventory: unknown (no stock information on the legacy site)
    if (prod?.inventory.length) bump("inventory", "unchanged");
    else {
      bump("inventory", "create");
      if (write && prod) track("inventory", (await tx.inventory.create({ data: { productId: prod.id, availability: "UNKNOWN" } })).id);
    }
  }

  // ── legacy provenance ──
  const productIdByKey = new Map((await tx.product.findMany({ where: { sourceKey: { not: null } }, select: { id: true, sourceKey: true } })).map((p) => [p.sourceKey!, p.id]));
  const existingLegacy = new Set((await tx.legacySourceRecord.findMany({ select: { entityType: true, legacyId: true, locale: true } })).map((r) => `${r.entityType}|${r.legacyId}|${r.locale}`));
  const newLegacy = plan.legacyRecords.filter((r) => !existingLegacy.has(`${r.entityType}|${r.legacyId}|${r.locale}`));
  c.legacySourceRecord = { ...newCounter(), create: newLegacy.length, unchanged: plan.legacyRecords.length - newLegacy.length };
  if (write && newLegacy.length) {
    const rows = await tx.legacySourceRecord.createManyAndReturn({
      data: newLegacy.map((r) => ({
        entityType: r.entityType,
        legacyId: r.legacyId,
        locale: r.locale as Locale,
        sourceUrl: r.sourceUrl,
        capturedAt: new Date(r.capturedAt),
        pageSha256: r.pageSha256,
        payload: r.payload as Prisma.InputJsonValue,
        targetId: r.entityType === "product" && r.locale === "tr" ? (productIdByKey.get(`kornne.com:${r.legacyId}`) ?? null) : null,
        migrationStatus: r.entityType === "product" ? (r.locale === "tr" ? "imported" : "match_suggested") : r.entityType === "media" ? ((r.payload as Record<string, string>).mirror_status === "ok" ? "imported" : "missing_at_source") : "recorded",
      })),
      select: { id: true },
    });
    rows.forEach((r) => track("legacySourceRecord", r.id));
  }

  // ── EN/FR match suggestions (never decided by the importer) ──
  const existingMatch = new Set((await tx.legacyMatchSuggestion.findMany({ select: { sourceLocale: true, sourceLegacyId: true } })).map((m) => `${m.sourceLocale}|${m.sourceLegacyId}`));
  const newMatches = plan.matches.filter((m) => !existingMatch.has(`${m.sourceLocale}|${m.sourceLegacyId}`));
  c.matchSuggestion = { ...newCounter(), create: newMatches.length, unchanged: plan.matches.length - newMatches.length };
  if (write && newMatches.length) {
    const rows = await tx.legacyMatchSuggestion.createManyAndReturn({
      data: newMatches.map((m) => ({ sourceLocale: m.sourceLocale, sourceLegacyId: m.sourceLegacyId, productId: productIdByKey.get(m.productSourceKey)!, confidence: m.confidence, method: m.method, evidence: m.evidence as Prisma.InputJsonValue })),
      select: { id: true },
    });
    rows.forEach((r) => track("matchSuggestion", r.id));
  }

  // ── redirects (LEGACY_AUDIT rows; admin rows are never touched) ──
  const existingRedirects = new Map((await tx.redirect.findMany({ select: { fromPath: true, toPath: true, source: true } })).map((r) => [r.fromPath, r]));
  const newRedirects = plan.redirects.filter((r) => !existingRedirects.has(r.fromPath));
  c.redirect = { ...newCounter(), create: newRedirects.length, unchanged: plan.redirects.length - newRedirects.length };
  if (write && newRedirects.length) {
    const rows = await tx.redirect.createManyAndReturn({ data: newRedirects.map((r) => ({ ...r, statusCode: 301, source: "LEGACY_AUDIT" as const })), select: { id: true } });
    rows.forEach((r) => track("redirect", r.id));
  }

  return { changes: c, created, notes };
}

async function main() {
  const plan = buildPlan(loadSources());
  const checks = planChecks(plan);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl!.replace(/sslmode=require\b/, "sslmode=verify-full") }) });
  const startedAt = new Date();
  try {
    const before = await counts(prisma);
    let result: Awaited<ReturnType<typeof run>>;
    let runId: string | null = null;
    if (!apply) {
      // dry run: the same code path inside a transaction that is always rolled back + write=false (no statements issued)
      result = await prisma.$transaction(async (tx) => run(tx, plan, false), { timeout: 600_000, maxWait: 30_000, isolationLevel: "RepeatableRead" });
    } else {
      result = await prisma.$transaction(
        async (tx) => {
          const r = await run(tx, plan, true);
          runId = (await tx.importRun.create({ data: { mode: "apply", status: "APPLIED", sourceHash: plan.sourceHash, startedAt, finishedAt: new Date(), summary: { changes: r.changes, checks, notes: r.notes } as Prisma.InputJsonValue, createdRefs: r.created as Prisma.InputJsonValue } })).id;
          return r;
        },
        { timeout: 600_000, maxWait: 30_000, isolationLevel: "Serializable" },
      );
    }
    const after = await counts(prisma);
    const report = { mode: apply ? "apply" : "dry-run", runId, database: { endpoint, database: new URL(dbUrl!).pathname.slice(1) }, sourceHash: plan.sourceHash, startedAt, finishedAt: new Date(), before, after, changes: result.changes, checks, notes: result.notes, createdRefCounts: Object.fromEntries(Object.entries(result.created).map(([k, v]) => [k, v.length])) };
    const dir = join(ROOT, "data/import-runs");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${startedAt.toISOString().replace(/[:.]/g, "-")}-${report.mode}.json`);
    writeFileSync(file, JSON.stringify(report, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 1));
    console.log(JSON.stringify({ mode: report.mode, runId, endpoint, before, after, changes: report.changes, notes: report.notes.length }, null, 1));
    console.log(`report: ${file}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "[db-url]") : e);
  process.exit(1);
});
