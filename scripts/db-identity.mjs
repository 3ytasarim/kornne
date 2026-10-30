// Read-only: prints the target database identity (never the password) and row counts of KORNNE tables.
// Usage: node scripts/db-identity.mjs
import "dotenv/config";
import pg from "pg";

const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
await client.query("BEGIN READ ONLY");
const one = async (sql) => {
  try {
    return (await client.query(sql)).rows[0];
  } catch {
    return null;
  }
};
const ident = await one("select current_database() db, current_user usr, split_part(version(), ' ', 2) pg_version, now() as at");
const branch = await one("select current_setting('neon.branch_id', true) branch_id, current_setting('neon.project_id', true) project_id, current_setting('neon.endpoint_id', true) endpoint_id");
const tables = (await client.query(`select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by relname`)).rows;
const counts = {};
for (const t of tables) counts[t.relname] = Number((await client.query(`select count(*)::int c from "${t.relname}"`)).rows[0].c);
await client.query("ROLLBACK");
await client.end();
console.log(JSON.stringify({ host: url.host, endpoint: url.host.split(".")[0], database: ident?.db, user: ident?.usr, pgVersion: ident?.pg_version, neon: branch, checkedAt: ident?.at, counts }, null, 1));
