// Exports the Turkish source content that must exist in every language (products, categories, corporate pages, menu
// labels) to data/translations/source.tr.json. Reads the LOCAL e2e copy only.
//   node scripts/i18n/export-source.mjs
import { writeFileSync } from "node:fs";
import pg from "pg";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const c = new pg.Client({ connectionString: testDatabaseUrl("e2e") });
await c.connect();
const q = async (s, a = []) => (await c.query(s, a)).rows;
const products = await q(`select p."sourceKey" as ref, t.title, t.slug, t."shortDescription" as short, t."descriptionHtml" as html
  from "Product" p join "ProductTranslation" t on t."productId" = p.id and t.locale = 'tr' where p.status <> 'ARCHIVED' order by p."sortOrder", p."sourceKey"`);
const categories = await q(`select c.key, t.name, t.slug, t.description from "Category" c join "CategoryTranslation" t on t."categoryId" = c.id and t.locale = 'tr' order by c."sortOrder"`);
const pages = await q(`select p.key, p.kind, t.title, t.slug, t."bodyHtml" as html from "Page" p join "PageTranslation" t on t."pageId" = p.id and t.locale = 'tr' where p.kind <> 'LEGAL' and p.status <> 'ARCHIVED'`);
const menus = await q(`select id, location, labels from "MenuItem" order by location, "sortOrder"`);
writeFileSync("data/translations/source.tr.json", JSON.stringify({ products, categories, pages, menus }, null, 2));
console.log({ products: products.length, categories: categories.length, pages: pages.length, menus: menus.length, chars: JSON.stringify({ products, categories, pages }).length });
await c.end();
