import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";
import { testDatabaseUrl } from "../test-db-url.mjs";

/**
 * Prisma client bound to the LOCAL integration database `kornne_it` (127.0.0.1 only — scripts/test-db/local-pg.mjs,
 * migrations via `npm run db:test:deploy`). Since Sprint 8+9 no test writes to Neon at all.
 * When the local server is not running, DB tests are reported as SKIPPED (tests/integration/global-setup.ts).
 */
export const hasTestDb = inject("localTestDb") === true;

export function testDb(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl("it") }), transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
}

let seq = 0;
/** Fixture product: numeric legacy-style ref in the 99xxxxx range so it can never collide with real ids. */
export async function makeProduct(db: PrismaClient, opts: { priceStatus?: "VERIFIED" | "UNVERIFIED"; amountMinor?: bigint; vatIncluded?: boolean | null; vatRateBp?: number | null; needsReview?: boolean; variants?: string[] } = {}) {
  const ref = String(9900000 + Math.floor(Math.random() * 90000) + ++seq);
  const p = await db.product.create({
    data: {
      sourceKey: `kornne.com:${ref}`,
      status: opts.needsReview ? "DRAFT" : "PUBLISHED",
      needsReview: !!opts.needsReview,
      translations: { create: { locale: "tr", title: `TEST ürün ${ref}`, slug: `test-urun-${ref}`, status: "LEGACY_SOURCE" } },
      prices: { create: { amountMinor: opts.amountMinor ?? 120000n, status: opts.priceStatus ?? "UNVERIFIED", vatIncluded: opts.vatIncluded === undefined ? true : opts.vatIncluded, vatRateBp: opts.vatRateBp === undefined ? 2000 : opts.vatRateBp, source: "ADMIN" } },
      variants: opts.variants ? { create: opts.variants.map((label, i) => ({ labels: { tr: label }, sortOrder: i })) } : undefined,
    },
    include: { variants: true },
  });
  return { product: p, ref };
}

/** Removes every fixture created in the test schema (only fixture-shaped rows; the schema is test-only anyway). */
export async function cleanupTestSchema(db: PrismaClient) {
  await db.paymentWebhookEvent.deleteMany({});
  // Sprint 8/9 fixtures
  await db.merchantSyncRun.deleteMany({});
  await db.seoAuditRun.deleteMany({});
  await db.merchantItemMapping.deleteMany({ where: { product: { sourceKey: { startsWith: "kornne.com:99" } } } });
  await db.order.deleteMany({ where: { isTest: true } });
  await db.cart.deleteMany({ where: { isTest: true } });
  await db.quoteRequest.deleteMany({ where: { OR: [{ isTest: true }, { email: { endsWith: "@kornne.test" } }, { phone: { startsWith: "+90 500 000" } }] } });
  await db.notificationOutbox.deleteMany({});
  await db.auditLog.deleteMany({});
  // Sprint 6/7 fixtures (the schema is test-only; these rows never exist in "public")
  await db.page.deleteMany({});
  await db.faqItem.deleteMany({});
  await db.banner.deleteMany({});
  await db.menuItem.deleteMany({});
  await db.siteSetting.deleteMany({});
  await db.redirect.deleteMany({ where: { OR: [{ source: "SLUG_CHANGE" }, { fromPath: { startsWith: "/urun/test-urun-" } }] } });
  await db.price.deleteMany({ where: { product: { sourceKey: { startsWith: "kornne.com:99" } } } });
  await db.productMedia.deleteMany({ where: { media: { origin: "admin_upload" } } });
  await db.mediaAsset.deleteMany({ where: { origin: "admin_upload" } });
  await db.product.deleteMany({ where: { OR: [{ sourceKey: { startsWith: "kornne.com:99" } }, { sourceKey: null }] } });
  await db.brand.deleteMany({ where: { slug: { startsWith: "test-" } } });
  await db.session.deleteMany({ where: { user: { email: { endsWith: "@kornne.test" } } } });
  await db.user.deleteMany({ where: { email: { endsWith: "@kornne.test" } } });
}

let userSeq = 0;
/** Fixture admin user in the test schema (no password — services take the actor id only). */
export async function makeUser(db: PrismaClient, role: "SUPER_ADMIN" | "ADMIN" | "PRODUCT_EDITOR" | "ORDER_OPERATOR" | "SEO_EDITOR" = "ADMIN") {
  return db.user.create({ data: { email: `it-${role.toLowerCase()}-${Date.now()}-${++userSeq}@kornne.test`, name: `IT ${role}`, role, passwordHash: "!test" } });
}
