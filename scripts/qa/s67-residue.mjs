// Read-only integrity / residue check after the Sprint 6+7 test runs (counts only — never connection details or PII).
import "dotenv/config";
import { readdirSync } from "node:fs";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await c.connect();
const n = async (sql) => Number((await c.query(sql)).rows[0].n);
const out = {
  Product: await n('select count(*) n from "Product"'),
  ProductPublished: await n(`select count(*) n from "Product" where status='PUBLISHED' and "needsReview"=false`),
  Held208: (await c.query(`select status::text s, "needsReview" r from "Product" where "sourceKey"='kornne.com:208'`)).rows[0],
  ProductTranslation: await n('select count(*) n from "ProductTranslation"'),
  ProductTranslationNonTr: await n(`select count(*) n from "ProductTranslation" where locale <> 'tr'`),
  ProductSeoSet: await n(`select count(*) n from "ProductTranslation" where "seoTitle" is not null or "seoDescription" is not null`),
  MediaAsset: await n('select count(*) n from "MediaAsset"'),
  MediaUploaded: await n(`select count(*) n from "MediaAsset" where origin <> 'legacy_import'`),
  MediaTranslation: await n('select count(*) n from "MediaTranslation"'),
  Redirect: await n('select count(*) n from "Redirect"'),
  RedirectSlugChange: await n(`select count(*) n from "Redirect" where source <> 'LEGACY_AUDIT'`),
  Price: await n('select count(*) n from "Price"'),
  PriceNotUnverified: await n(`select count(*) n from "Price" where status <> 'UNVERIFIED'`),
  PriceAdminRows: await n(`select count(*) n from "Price" where source <> 'LEGACY_IMPORT'`),
  PriceEvent: await n('select count(*) n from "PriceEvent"'),
  MatchesDecided: await n(`select count(*) n from "LegacyMatchSuggestion" where status <> 'SUGGESTED'`),
  LegacySourceRecord: await n('select count(*) n from "LegacySourceRecord"'),
  LegacyTargetsLinkedNonTr: await n(`select count(*) n from "LegacySourceRecord" where "entityType"='product' and locale <> 'tr' and "targetId" is not null`),
  User: await n('select count(*) n from "User"'),
  Session: await n('select count(*) n from "Session"'),
  UserInvite: await n('select count(*) n from "UserInvite"'),
  LoginAttempt: await n('select count(*) n from "LoginAttempt"'),
  QuoteRequest: await n('select count(*) n from "QuoteRequest"'),
  QuoteNote: await n('select count(*) n from "QuoteNote"'),
  NotificationOutbox: await n('select count(*) n from "NotificationOutbox"'),
  Page: await n('select count(*) n from "Page"'),
  PageTranslation: await n('select count(*) n from "PageTranslation"'),
  PageRevision: await n('select count(*) n from "PageRevision"'),
  MenuItem: await n('select count(*) n from "MenuItem"'),
  SiteSetting: await n('select count(*) n from "SiteSetting"'),
  FaqItem: await n('select count(*) n from "FaqItem"'),
  Banner: await n('select count(*) n from "Banner"'),
  AuditLog: await n('select count(*) n from "AuditLog"'),
  Cart: await n('select count(*) n from "Cart"'),
  Order: await n('select count(*) n from "Order"'),
  /** 445 = only the preserved originals; any test / admin upload would add files */
  filesInPublicUpload: readdirSync("public/upload").length,
};
console.log(JSON.stringify(out, null, 1));
await c.end();
