/**
 * The ONLY database URLs that tests may write to: a local PostgreSQL on 127.0.0.1 (scripts/test-db/local-pg.mjs).
 *  - kornne_it  : empty schema for integration tests (fixtures are created and wiped)
 *  - kornne_e2e : disposable copy of the Neon data for the app server under Playwright
 *  - kornne_restore : target of the backup/restore REHEARSAL (scripts/ops/backup-rehearsal.mjs), recreated each run
 * Fail-closed: every test entry point calls assertLocalTestUrl(); a Neon / remote host, another port (another local
 * project) or any other database name aborts the run. Local-only credentials (127.0.0.1, disposable data).
 */
export const LOCAL = { host: "127.0.0.1", port: 54391, user: "kornne_test", password: "kornne-local-only", databases: { it: "kornne_it", e2e: "kornne_e2e", restore: "kornne_restore" } };

/** @param {"it" | "e2e" | "restore" | "postgres"} kind */
export function localTestUrl(kind = "it") {
  const db = kind === "postgres" ? "postgres" : LOCAL.databases[kind];
  return `postgresql://${LOCAL.user}:${LOCAL.password}@${LOCAL.host}:${LOCAL.port}/${db}`;
}

export function assertLocalTestUrl(url) {
  const u = new URL(url);
  const dbs = Object.values(LOCAL.databases).map((d) => `/${d}`);
  // host, port AND database name: never a remote server, never another local project's database
  if (!["127.0.0.1", "localhost", "::1"].includes(u.hostname) || /neon\.tech/i.test(url) || Number(u.port) !== LOCAL.port || !dbs.includes(u.pathname)) {
    throw new Error(`REFUSED: tests must write to the local test database only (got ${u.hostname}:${u.port}${u.pathname})`);
  }
  return url;
}

/** @param {"it" | "e2e"} kind */
export function testDatabaseUrl(kind = "it") {
  return assertLocalTestUrl(process.env[kind === "e2e" ? "TEST_E2E_DATABASE_URL" : "TEST_DATABASE_URL"] || localTestUrl(kind));
}
