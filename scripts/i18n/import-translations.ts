/**
 * Imports the catalogue translations (data/translations/<locale>.json — products, categories, corporate page, menu
 * labels) for EN / DE / FR / RU / AR. Turkish (the canonical source) is never touched.
 *
 * Rules
 *  - Product translations: created or updated, status APPROVED (public + hreflang). A translation an editor already
 *    changed after the first import is kept unless --overwrite is passed (importChecksum marks our own rows).
 *  - Categories: an existing translation keeps its slug and name (URLs and the old site's official names stay); it is
 *    approved and gets SEO texts. Missing languages are created. "Tüm Ürünler" always uses the slug the not-found
 *    page links to (src/lib/i18n/boundary-strings.ts).
 *  - Corporate page: a missing language version is created and published; an existing version whose text is EMPTY
 *    (legacy EN/FR/RU/AR pages had no body) gets the translation under its existing slug. Written texts stay.
 *  - Menu labels: the language's label is filled when missing.
 * One transaction per locale. Dry run by default.
 *
 *   npx tsx scripts/i18n/import-translations.ts                                   # dry run against the local e2e copy
 *   npx tsx scripts/i18n/import-translations.ts --db=e2e --apply                  # local e2e copy
 *   npx tsx scripts/i18n/import-translations.ts --apply --confirm-db=<endpoint>   # production (Neon), endpoint id required
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient, type Locale } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sanitizeRichText } from "../../src/lib/catalog/sanitize";
import { BOUNDARY_STRINGS } from "../../src/lib/i18n/boundary-strings";
import { createPage, publishPage, savePageDraft } from "../../src/lib/cms/service";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

type File = {
  locale: Locale;
  products: { ref: string; title: string; slug: string; short: string | null; html: string; seoTitle: string; seoDescription: string }[];
  categories: { key: string; name: string; slug: string; description: string | null; seoTitle: string; seoDescription: string }[];
  /** create: a page that exists only in foreign languages (e.g. the US shipping / privacy pages) is created when missing, with its footer link */
  pages: { key: string; title: string; slug: string; html: string; seoTitle: string; seoDescription: string; create?: { kind: "LEGAL" | "INFO"; menu: { location: "FOOTER_LEGAL" | "FOOTER_CORPORATE"; sortOrder: number } } }[];
  menus: { id: string; label: string }[];
  /** product option labels, matched by their Turkish text; only empty language labels are filled */
  variants?: { tr: string; label: string }[];
};

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");
const DB = arg("db") ?? (APPLY ? "neon" : "e2e");
const LOCALES: Locale[] = (arg("locales")?.split(",") as Locale[] | undefined) ?? ["en", "de", "fr", "ru", "ar"];
const checksum = (o: unknown) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 32);
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim() || null;

async function main() {
  let url: string;
  if (DB === "e2e") url = testDatabaseUrl("e2e");
  else {
    url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
    const endpoint = new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");
    if (APPLY && arg("confirm-db") !== endpoint) throw new Error(`REFUSED: pass --confirm-db=${endpoint} to write to this database`);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), transactionOptions: { maxWait: 10_000, timeout: 120_000 } });
  const actor = await db.user.findFirst({ where: { role: "SUPER_ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  // production must name a real author; the local test copy has no users → pages are recorded without an author
  if (APPLY && !actor && DB !== "e2e") throw new Error("REFUSED: no active SUPER_ADMIN to record as the author of the published pages");

  for (const locale of LOCALES) {
    const f = JSON.parse(readFileSync(`data/translations/${locale}.json`, "utf8")) as File;
    if (f.locale !== locale) throw new Error(`${locale}.json declares locale ${f.locale}`);
    const stats = { productsCreated: 0, productsUpdated: 0, productsKept: 0, productsMissing: 0, categoriesCreated: 0, categoriesApproved: 0, pagesCreated: 0, menus: 0, variants: 0 };

    const products = await db.product.findMany({ where: { sourceKey: { in: f.products.map((p) => p.ref) } }, select: { id: true, sourceKey: true, translations: { where: { locale }, select: { id: true, importChecksum: true, title: true, slug: true, shortDescription: true, descriptionHtml: true, seoTitle: true, seoDescription: true } } } });
    const cats = await db.category.findMany({ where: { key: { in: f.categories.map((c) => c.key) } }, select: { id: true, key: true, translations: { where: { locale }, select: { id: true, slug: true, name: true, seoTitle: true } } } });

    const work = async (tx: Pick<PrismaClient, "productTranslation" | "categoryTranslation" | "menuItem" | "productVariant">) => {
      if (f.variants?.length) {
        const rows = await tx.productVariant.findMany({ select: { id: true, labels: true } });
        for (const r of rows) {
          const labels = (r.labels ?? {}) as Record<string, string>;
          const t = f.variants.find((v) => v.tr.trim() === (labels.tr ?? "").trim());
          if (!t || labels[locale]) continue;
          if (APPLY) await tx.productVariant.update({ where: { id: r.id }, data: { labels: { ...labels, [locale]: t.label } } });
          stats.variants++;
        }
      }
      for (const p of f.products) {
        const prod = products.find((x) => x.sourceKey === p.ref);
        if (!prod) {
          stats.productsMissing++;
          continue;
        }
        const data = { title: p.title.normalize("NFC").trim(), slug: p.slug, shortDescription: clean(p.short), descriptionHtml: sanitizeRichText(p.html), seoTitle: clean(p.seoTitle), seoDescription: clean(p.seoDescription) };
        const sum = checksum(data);
        const existing = prod.translations[0];
        if (existing) {
          // our own earlier import is recognisable by its checksum; anything else was edited by a person
          const edited = existing.importChecksum !== checksum({ title: existing.title, slug: existing.slug, shortDescription: existing.shortDescription, descriptionHtml: existing.descriptionHtml, seoTitle: existing.seoTitle, seoDescription: existing.seoDescription });
          if (edited && !OVERWRITE) {
            stats.productsKept++;
            continue;
          }
          if (APPLY) await tx.productTranslation.update({ where: { id: existing.id }, data: { ...data, status: "APPROVED", importChecksum: sum } });
          stats.productsUpdated++;
        } else {
          if (APPLY) await tx.productTranslation.create({ data: { productId: prod.id, locale, ...data, status: "APPROVED", importChecksum: sum } });
          stats.productsCreated++;
        }
      }
      for (const c of f.categories) {
        const cat = cats.find((x) => x.key === c.key);
        if (!cat) continue;
        const allSlug = c.key === "tum-urunler" ? BOUNDARY_STRINGS[locale]?.allProductsSlug : null;
        const existing = cat.translations[0];
        const seo = { seoTitle: existing?.seoTitle || clean(c.seoTitle), seoDescription: clean(c.seoDescription), description: clean(c.description) };
        if (existing) {
          if (APPLY) await tx.categoryTranslation.update({ where: { id: existing.id }, data: { ...seo, status: "APPROVED" } });
          stats.categoriesApproved++;
        } else {
          if (APPLY) await tx.categoryTranslation.create({ data: { categoryId: cat.id, locale, name: c.name.trim(), slug: allSlug || c.slug, ...seo, status: "APPROVED" } });
          stats.categoriesCreated++;
        }
      }
      for (const m of f.menus) {
        const row = await tx.menuItem.findUnique({ where: { id: m.id }, select: { labels: true } });
        const labels = (row?.labels ?? {}) as Record<string, string>;
        if (!row || labels[locale]) continue;
        if (APPLY) await tx.menuItem.update({ where: { id: m.id }, data: { labels: { ...labels, [locale]: m.label } } });
        stats.menus++;
      }
    };
    if (APPLY) await db.$transaction(work);
    else await work(db);

    // corporate page(s): create + publish only where the language version does not exist yet
    for (const pg of f.pages) {
      let page = await db.page.findUnique({ where: { key: pg.key }, select: { id: true, translations: { where: { locale }, select: { id: true, slug: true, bodyHtml: true, updatedAt: true } } } });
      const a = { id: (actor?.id ?? null) as string, canPublish: true };
      let justCreated = false;
      if (!page && pg.create) {
        stats.pagesCreated++;
        justCreated = true;
        if (!APPLY) continue;
        // new page that exists in this language only (no Turkish original): created, published, linked in the footer
        const made = await createPage(db, a, { kind: pg.create.kind, key: pg.key, locale, title: pg.title, slug: pg.slug });
        page = { id: made.page.id, translations: [{ id: made.translation.id, slug: pg.slug, bodyHtml: "", updatedAt: made.translation.updatedAt }] };
        if (!(await db.menuItem.findFirst({ where: { kind: "page", pageKey: pg.key } }))) await db.menuItem.create({ data: { location: pg.create.menu.location, kind: "page", pageKey: pg.key, labels: { [locale]: pg.title }, sortOrder: pg.create.menu.sortOrder } });
      } else if (page && pg.create) {
        // existing created page: make sure this language's footer label is present
        const m = await db.menuItem.findFirst({ where: { kind: "page", pageKey: pg.key } });
        if (APPLY && m && !(m.labels as Record<string, string>)[locale]) await db.menuItem.update({ where: { id: m.id }, data: { labels: { ...(m.labels as Record<string, string>), [locale]: pg.title } } });
      }
      const existing = page?.translations[0];
      if (!page || (existing && existing.bodyHtml.trim())) continue;
      if (!justCreated) stats.pagesCreated++;
      if (!APPLY) continue;
      await savePageDraft(db, a, { pageId: page.id, locale, title: pg.title, slug: existing?.slug ?? pg.slug, bodyHtml: pg.html, seoTitle: pg.seoTitle, seoDescription: pg.seoDescription, note: "Çeviri içe aktarımı", ...(existing ? { expectedUpdatedAt: existing.updatedAt.toISOString() } : {}) });
      await publishPage(db, a, page.id, locale);
    }
    console.log(locale, stats);
  }
  if (APPLY) await db.auditLog.create({ data: { actorId: actor?.id ?? null, action: "i18n.translations_imported", entityType: "ProductTranslation", after: { locales: LOCALES, overwrite: OVERWRITE } } });
  console.log(APPLY ? "APPLIED" : "DRY RUN — nothing written. Add --apply (and --confirm-db for Neon).");
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message.slice(0, 1500) : e);
  process.exit(1);
});
