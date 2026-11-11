// Isolated E2E run: build + Playwright with every database URL forced to the LOCAL disposable copy.
//   node scripts/test-db/e2e.mjs [--no-build] [playwright args...]
// Requires: node scripts/test-db/local-pg.mjs start   (+ clone, to refresh the copy from Neon read-only)
// Two builds: .next (noindex environment, port 3470) and .next-prodlike (offline production-like preview, port 3471:
// SITE_INDEXABLE + CATALOG_DATA_VERIFIED + SITE_URL=http://localhost:3471 — localhost only, nothing is published).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";
import { PRODLIKE_ENV } from "../../tests/prodlike-env.mjs";
import { LOCAL_COMMERCE_ENV } from "../../tests/local-commerce-env.mjs";

const db = testDatabaseUrl("e2e"); // throws unless 127.0.0.1:<kornne port>/kornne_e2e
// Playwright browsers in an ASCII path: Firefox fails to start from a user folder with non-ASCII characters on Windows
const PW = join(process.cwd(), ".pw-browsers");
const env = { ...process.env, DATABASE_URL: db, DIRECT_URL: db, KORNNE_TEST_DB: "local-e2e", ...(existsSync(PW) ? { PLAYWRIGHT_BROWSERS_PATH: PW } : {}) };
const args = process.argv.slice(2);
const noBuild = args.includes("--no-build");
const pw = args.filter((a) => a !== "--no-build");
const run = (cmd, a, e = env) => {
  const r = spawnSync(cmd, a, { stdio: "inherit", env: e, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
if (!noBuild) {
  run("npx", ["next", "build"], { ...env, ...LOCAL_COMMERCE_ENV, FX_FIXTURE: "USD:50.1981,EUR:56.3795" });
  run("npx", ["next", "build"], { ...env, ...PRODLIKE_ENV });
}
run("npx", ["playwright", "test", ...pw]);
