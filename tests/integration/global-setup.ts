import pg from "pg";
import type { TestProject } from "vitest/node";
import { testDatabaseUrl } from "../test-db-url.mjs";

declare module "vitest" {
  export interface ProvidedContext {
    localTestDb: boolean;
  }
}

/** Probes the LOCAL integration DB once; DB-backed suites are skipped (and say so) when it is not running. */
export default async function setup(project: TestProject) {
  const c = new pg.Client({ connectionString: testDatabaseUrl("it"), connectionTimeoutMillis: 3000 });
  let ok = false;
  try {
    await c.connect();
    const r = await c.query(`select current_database() db, to_regclass('public."Product"') is not null migrated`);
    ok = r.rows[0].db === "kornne_it" && r.rows[0].migrated === true;
  } catch {
    ok = false;
  } finally {
    await c.end().catch(() => {});
  }
  if (!ok) console.warn("\n[integration] SKIPPED — ISOLATION UNAVAILABLE: start node scripts/test-db/local-pg.mjs start and npm run db:test:deploy\n");
  project.provide("localTestDb", ok);
}
