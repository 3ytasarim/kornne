// Read-only integrity check after the Sprint 4+5 test runs (prints counts only, never connection details).
import "dotenv/config";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await c.connect();
const q = async (sql) => Number((await c.query(sql)).rows[0].n);
const out = {
  Product: await q('select count(*) n from public."Product"'),
  MediaAsset: await q('select count(*) n from public."MediaAsset"'),
  Redirect: await q('select count(*) n from public."Redirect"'),
  Price: await q('select count(*) n from public."Price"'),
  PriceNotUnverified: await q(`select count(*) n from public."Price" where status <> 'UNVERIFIED'`),
  User: await q('select count(*) n from public."User"'),
  Session: await q('select count(*) n from public."Session"'),
  AuditLog: await q('select count(*) n from public."AuditLog"'),
  LoginAttempt: await q('select count(*) n from public."LoginAttempt"'),
  QuoteRequest: await q('select count(*) n from public."QuoteRequest"'),
  QuoteItem: await q('select count(*) n from public."QuoteItem"'),
  Cart: await q('select count(*) n from public."Cart"'),
  Order: await q('select count(*) n from public."Order"'),
  PaymentAttempt: await q('select count(*) n from public."PaymentAttempt"'),
  Held208: (await c.query(`select status::text s, "needsReview" r from public."Product" where "sourceKey"='kornne.com:208'`)).rows[0],
  MatchesApproved: await q(`select count(*) n from public."LegacyMatchSuggestion" where status <> 'SUGGESTED'`),
  TestSchemaFixtures: await q(`select count(*) n from kornne_test."Product"`),
};
console.log(JSON.stringify(out, null, 1));
await c.end();
