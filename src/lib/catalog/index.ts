import "server-only";
import { prismaRepository } from "./prisma-repository";
import type { CatalogRepository } from "./types";

/** Single entry point for storefront reads — Sprint 3: Neon via Prisma (snapshot repository kept for tests/audit). */
export const catalog: CatalogRepository = prismaRepository;

/**
 * Launch gate for search indexing of catalog pages (client sign-off on catalog data). Default FALSE → catalog pages
 * stay noindex and the sitemap stays empty. Since Sprint 8 it is an explicit env flag (CATALOG_DATA_VERIFIED=true) so
 * the PRODUCTION-LIKE behaviour can be verified offline (localhost, isolated DB) without editing code. It never
 * enables Offer markup, prices or a Merchant feed — those have their own per-product gates.
 */
export const CATALOG_DATA_VERIFIED = process.env.CATALOG_DATA_VERIFIED === "true";

/** ISR window for catalog pages (seconds). Admin approvals also call revalidatePath. */
export const CATALOG_REVALIDATE = 300;

export { invalidateCatalog } from "./prisma-repository";
export type * from "./types";
