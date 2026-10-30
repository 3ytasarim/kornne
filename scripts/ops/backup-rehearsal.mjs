// Backup → restore REHEARSAL (Sprint 11). Proves that a logical backup of the KORNNE database can be restored and
// verified within a measured time — WITHOUT touching production data:
//   1. export : source DB read inside a READ ONLY, REPEATABLE READ transaction (consistent snapshot, no writes)
//   2. mask   : personal data columns are replaced BEFORE anything is written to disk (rehearsal archives are not
//               customer backups); secrets (password hashes, session tokens) are dropped
//   3. archive: gzip JSON-lines + manifest (row counts, SHA-256 of every table and of the archive)
//   4. restore: into the LOCAL, disposable database `kornne_restore` (recreated, migrations deployed) — the test-DB
//               guard refuses any other target
//   5. verify : row counts = manifest, table hashes = manifest, KORNNE invariants (41/40/#208, 445 media, 125 redirects,
//               41 UNVERIFIED prices, 74 undecided matches), media SHA-256 set unchanged
// The production procedure (pg_dump -Fc + age encryption + Storage Box) is deploy/scripts/backup-db.sh; it needs
// pg_dump on the server and is NOT executed here.
//   node scripts/ops/backup-rehearsal.mjs            (source: DIRECT_URL / DATABASE_URL, read-only)
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import pg from "pg";
import { assertLocalTestUrl, localTestUrl } from "../../tests/test-db-url.mjs";

const q = (s) => `"${s.replace(/"/g, '""')}"`;
// personal data / secrets → masked or dropped in the rehearsal archive
const MASK = {
  QuoteRequest: { name: "Maskeli Kişi", company: null, email: (r) => `masked+${String(r.id).slice(-6)}@example.invalid`, phone: null, message: null, ipHash: null, userAgent: null },
  QuoteNote: { body: "[maskeli not]" },
  Customer: { email: (r) => `masked+${String(r.id).slice(-6)}@example.invalid`, name: "Maskeli", phone: null, passwordHash: null },
  User: { email: (r) => `masked+${String(r.id).slice(-6)}@example.invalid`, name: "Maskeli Yönetici", passwordHash: "!masked" },
  Session: "drop",
  UserInvite: "drop",
  LoginAttempt: "drop",
  Order: { billing: null, shipping: null, note: null, accessTokenHash: null },
};

const t0 = Date.now();
const source = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!source) throw new Error("DIRECT_URL / DATABASE_URL missing");
const target = assertLocalTestUrl(localTestUrl("restore"));

// ── 1-3: export (read-only snapshot) + mask + archive ─────────────────────────────────────────────────────────────
const src = new pg.Client({ connectionString: source });
await src.connect();
await src.query("begin transaction isolation level repeatable read read only");
const tables = (await src.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by table_name`)).rows.map((r) => r.table_name);
const migrations = (await src.query(`select migration_name from _prisma_migrations where finished_at is not null order by migration_name`)).rows.map((r) => r.migration_name);
const lines = [];
const manifest = { createdAt: new Date().toISOString(), source: new URL(source).hostname.replace(/^[^.]+/, "<endpoint>"), migrations, tables: {} };
for (const t of tables) {
  const cols = (await src.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t])).rows;
  const rule = MASK[t];
  const rows = rule === "drop" ? [] : (await src.query(`select * from ${q(t)} order by 1`)).rows;
  const h = createHash("sha256");
  for (const row of rows) {
    if (rule && rule !== "drop") for (const [col, v] of Object.entries(rule)) if (col in row && row[col] !== null) row[col] = typeof v === "function" ? v(row) : v;
    const rec = Object.fromEntries(cols.map((c) => [c.column_name, typeof row[c.column_name] === "bigint" ? row[c.column_name].toString() : row[c.column_name]]));
    const line = JSON.stringify({ t, r: rec });
    h.update(line);
    lines.push(line);
  }
  manifest.tables[t] = { rows: rows.length, sha256: h.digest("hex"), masked: !!rule, dropped: rule === "drop" };
}
await src.query("rollback");
await src.end();
const exportMs = Date.now() - t0;
mkdirSync("data/backups", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const archive = gzipSync(Buffer.from(lines.join("\n")));
const file = `data/backups/rehearsal-${stamp}.jsonl.gz`;
writeFileSync(file, archive);
manifest.archive = { file, bytes: archive.length, sha256: createHash("sha256").update(archive).digest("hex") };
writeFileSync(file.replace(".jsonl.gz", ".manifest.json"), JSON.stringify(manifest, null, 1));

// ── 4: restore into the disposable local database ─────────────────────────────────────────────────────────────────
const t1 = Date.now();
const admin = new pg.Client({ connectionString: localTestUrl("postgres") });
await admin.connect();
await admin.query("drop database if exists kornne_restore with (force)");
await admin.query("create database kornne_restore");
await admin.end();
const mig = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: target, DIRECT_URL: target }, encoding: "utf8" });
if (mig.status !== 0) throw new Error(`migrate deploy failed: ${(mig.stderr || mig.stdout).slice(-400)}`);
const read = gunzipSync(readFileSync(file)).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const dst = new pg.Client({ connectionString: target });
await dst.connect();
await dst.query("begin");
await dst.query("set local session_replication_role = replica");
const colTypes = {};
for (const { t, r } of read) {
  colTypes[t] ??= Object.fromEntries((await dst.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map((c) => [c.column_name, c.data_type]));
  const cols = Object.keys(r);
  const vals = cols.map((c) => (["json", "jsonb"].includes(colTypes[t][c]) && r[c] !== null ? JSON.stringify(r[c]) : r[c]));
  await dst.query(`insert into ${q(t)} (${cols.map(q).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
}
await dst.query("commit");
const restoreMs = Date.now() - t1;

// ── 5: verify ───────────────────────────────────────────────────────────────────────────────────────────────────────
const problems = [];
for (const [t, m] of Object.entries(manifest.tables)) {
  const n = (await dst.query(`select count(*)::int n from ${q(t)}`)).rows[0].n;
  if (n !== m.rows) problems.push(`${t}: ${n} rows, manifest ${m.rows}`);
}
const one = async (sql) => (await dst.query(sql)).rows[0];
const inv = {
  products: (await one(`select count(*)::int n from "Product"`)).n,
  published: (await one(`select count(*)::int n from "Product" where status='PUBLISHED' and not "needsReview"`)).n,
  held208: await one(`select status::text, "needsReview" from "Product" where "sourceKey"='kornne.com:208'`),
  media: (await one(`select count(*)::int n from "MediaAsset"`)).n,
  legacyRedirects: (await one(`select count(*)::int n from "Redirect" where source='LEGACY_AUDIT'`)).n,
  unverifiedPrices: (await one(`select count(*)::int n from "Price" where status='UNVERIFIED'`)).n,
  undecidedMatches: (await one(`select count(*)::int n from "LegacyMatchSuggestion" where status='SUGGESTED'`)).n,
};
const expect = { products: 41, published: 40, media: 445, legacyRedirects: 125, unverifiedPrices: 41, undecidedMatches: 74 };
for (const [k, v] of Object.entries(expect)) if (inv[k] !== v) problems.push(`${k}: ${inv[k]} ≠ ${v}`);
if (inv.held208?.status !== "DRAFT" || inv.held208?.needsReview !== true) problems.push("#208 not DRAFT + needsReview");
// media hashes against the files on disk (the backup must reference exactly the 445 originals)
const media = (await dst.query(`select "storageKey", sha256 from "MediaAsset"`)).rows;
let mediaOk = 0;
for (const m of media) if (createHash("sha256").update(readFileSync(`data/source-media/${m.storageKey}`)).digest("hex") === m.sha256) mediaOk++;
if (mediaOk !== 445) problems.push(`media hashes ${mediaOk}/445`);
const pii = (await one(`select (select count(*) from "QuoteRequest" where email not like 'masked+%@example.invalid')::int quotes, (select count(*) from "User" where email not like 'masked+%@example.invalid')::int users, (select count(*) from "Session")::int sessions`));
if (pii.quotes || pii.users || pii.sessions) problems.push(`unmasked personal data in restore: ${JSON.stringify(pii)}`);
await dst.end();

const report = { ok: problems.length === 0, problems, archive: { bytes: manifest.archive.bytes, sha256: manifest.archive.sha256.slice(0, 16) + "…", file }, migrations: migrations.length, tables: tables.length, rows: read.length, invariants: inv, mediaHashesOk: mediaOk, timingsMs: { export: exportMs, restoreAndMigrate: restoreMs, total: Date.now() - t0 } };
mkdirSync("data/qa-logs", { recursive: true });
writeFileSync("data/qa-logs/backup-rehearsal.json", JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(report.ok ? 0 : 1);
