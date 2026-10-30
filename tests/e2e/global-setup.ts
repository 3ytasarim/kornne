import pg from "pg";
import { testDatabaseUrl } from "../test-db-url.mjs";
import { createTestAdmin, deleteTestAdmins, deleteTestQuotes } from "./test-admin";

/**
 * Fail closed before any test writes: the target must be the local disposable e2e copy and must contain the cloned
 * catalog (otherwise run `node scripts/test-db/local-pg.mjs start` + `clone`).
 */
export default async function globalSetup() {
  const url = testDatabaseUrl("e2e");
  const c = new pg.Client({ connectionString: url });
  try {
    await c.connect();
  } catch {
    throw new Error("SKIPPED — ISOLATION UNAVAILABLE: local test PostgreSQL is not running (node scripts/test-db/local-pg.mjs start)");
  }
  const r = await c.query(`select current_database() db, inet_server_addr()::text addr, (select count(*) from "Product")::int products`);
  await c.end();
  const row = r.rows[0] as { db: string; addr: string | null; products: number };
  if (row.db !== "kornne_e2e" || (row.addr && !/^(127\.0\.0\.1|::1)/.test(row.addr))) throw new Error("REFUSED: e2e database is not the local kornne_e2e copy");
  if (row.products < 41) throw new Error("local e2e copy is empty — run node scripts/test-db/local-pg.mjs clone");
  await deleteTestQuotes();
  await deleteTestAdmins(); // leftovers from an aborted run
  await createTestAdmin();
}
