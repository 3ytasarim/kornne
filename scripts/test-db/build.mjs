// Builds both isolated test builds against the LOCAL e2e copy: .next (noindex env) and .next-prodlike (offline preview).
//   node scripts/test-db/build.mjs [--only=dev|prodlike]
import { spawnSync } from "node:child_process";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";
import { PRODLIKE_ENV } from "../../tests/prodlike-env.mjs";
import { LOCAL_COMMERCE_ENV } from "../../tests/local-commerce-env.mjs";

const db = testDatabaseUrl("e2e");
const env = { ...process.env, DATABASE_URL: db, DIRECT_URL: db, KORNNE_TEST_DB: "local-e2e" };
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const targets = [only !== "prodlike" && { ...env, ...LOCAL_COMMERCE_ENV }, only !== "dev" && { ...env, ...PRODLIKE_ENV }].filter(Boolean);
for (const e of targets) {
  const t = Date.now();
  const r = spawnSync("npx", ["next", "build"], { stdio: "inherit", env: e, shell: process.platform === "win32" });
  console.log(`BUILD ${e.NEXT_DIST_DIR ?? ".next"} exit=${r.status} ${Math.round((Date.now() - t) / 1000)}s`);
  if (r.status) process.exit(r.status ?? 1);
}
