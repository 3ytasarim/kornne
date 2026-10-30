/**
 * Isolated LOCAL PostgreSQL for every test that writes (Sprint 8+9 rule: tests never write to the primary Neon DB).
 * Real PostgreSQL 18 binaries from the `embedded-postgres` package — no Docker / admin rights needed. Data lives in
 * `.test-db/` (gitignored); the server listens on 127.0.0.1 only.
 *
 *   node scripts/test-db/local-pg.mjs start   # init (first time) + start, keeps running (Ctrl+C to stop)
 *   node scripts/test-db/local-pg.mjs clone   # migrations + copy of the CURRENT Neon data, Neon read in READ ONLY tx
 *   node scripts/test-db/local-pg.mjs status
 *
 * The connection string is built by `tests/test-db-url.mjs` and asserted to be local before anything writes.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { LOCAL, localTestUrl } from "../../tests/test-db-url.mjs";

const cmd = process.argv[2] ?? "status";
const DIR = resolve(".test-db", "pgdata");

async function start() {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const fresh = !existsSync(join(DIR, "PG_VERSION"));
  mkdirSync(DIR, { recursive: true });
  const server = new EmbeddedPostgres({ databaseDir: DIR, user: LOCAL.user, password: LOCAL.password, port: LOCAL.port, persistent: true, initdbFlags: ["--locale=C", "--encoding=UTF8"], postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: () => {}, onError: (e) => console.error(String(e).slice(0, 300)) });
  if (fresh) await server.initialise();
  await server.start();
  const c = new pg.Client({ connectionString: localTestUrl("postgres") });
  await c.connect();
  for (const db of Object.values(LOCAL.databases)) {
    const exists = await c.query("select 1 from pg_database where datname = $1", [db]);
    if (!exists.rowCount) await c.query(`create database ${db}`);
  }
  await c.end();
  console.log(`local test PostgreSQL running on 127.0.0.1:${LOCAL.port} (${Object.values(LOCAL.databases).join(", ")}) (Ctrl+C to stop)`);
  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

const quoteIdent = (s) => `"${s.replace(/"/g, '""')}"`;

async function clone() {
  const source = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!source) throw new Error("DIRECT_URL not set (source for the clone)");
  const target = localTestUrl("e2e");
  // 1) schema = the same migrations as production (prisma migrate deploy against the LOCAL url only)
  const r = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: target, DIRECT_URL: target }, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`migrate deploy failed: ${(r.stderr || r.stdout).slice(-500)}`);
  // 2) data: read Neon inside a READ ONLY transaction, write the local copy
  const src = new pg.Client({ connectionString: source });
  const dst = new pg.Client({ connectionString: target });
  await src.connect();
  await dst.connect();
  try {
    await src.query("begin transaction isolation level repeatable read read only");
    const tables = (await src.query(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by table_name`)).rows.map((x) => x.table_name);
    await dst.query("begin");
    await dst.query("set local session_replication_role = replica"); // FK order does not matter while loading
    const counts = {};
    for (const t of tables) {
      await dst.query(`delete from ${quoteIdent(t)}`); // local copy only — re-clone is idempotent
      const cols = (await src.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t])).rows;
      const rows = (await src.query(`select * from ${quoteIdent(t)}`)).rows;
      for (const row of rows) {
        const values = cols.map((c) => (c.data_type === "json" || c.data_type === "jsonb") && row[c.column_name] !== null ? JSON.stringify(row[c.column_name]) : row[c.column_name]);
        await dst.query(`insert into ${quoteIdent(t)} (${cols.map((c) => quoteIdent(c.column_name)).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, values);
      }
      counts[t] = rows.length;
    }
    await dst.query("commit");
    await src.query("rollback");
    console.log(JSON.stringify({ cloned: true, target: `127.0.0.1:${LOCAL.port}/${LOCAL.databases.e2e}`, counts }, null, 1));
  } catch (e) {
    await dst.query("rollback").catch(() => {});
    await src.query("rollback").catch(() => {});
    throw e;
  } finally {
    await src.end();
    await dst.end();
  }
}

async function status() {
  const c = new pg.Client({ connectionString: localTestUrl("e2e") });
  try {
    await c.connect();
    const r = await c.query(`select current_database() db, inet_server_addr()::text addr, (select count(*) from "Product")::int products`);
    console.log(JSON.stringify(r.rows[0]));
  } catch (e) {
    console.log("not running / not cloned:", e.message.split("\n")[0]);
  } finally {
    await c.end().catch(() => {});
  }
}

const run = { start, clone, status }[cmd];
if (!run) console.error("usage: start | clone | status");
else
  run().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
