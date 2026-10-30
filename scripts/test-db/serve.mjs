// Serves an isolated build against the LOCAL e2e copy (manual QA / SEO audit / Lighthouse).
//   node scripts/test-db/serve.mjs dev        → .next on :3470 (noindex environment)
//   node scripts/test-db/serve.mjs prodlike   → .next-prodlike on :3471 (offline production-like preview)
import { spawn } from "node:child_process";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";
import { PRODLIKE_ENV, PRODLIKE_PORT } from "../../tests/prodlike-env.mjs";
import { LOCAL_COMMERCE_ENV } from "../../tests/local-commerce-env.mjs";

const kind = process.argv[2] === "prodlike" ? "prodlike" : "dev";
const db = testDatabaseUrl("e2e");
const env = { ...process.env, DATABASE_URL: db, DIRECT_URL: db, KORNNE_TEST_DB: "local-e2e", ...(kind === "prodlike" ? PRODLIKE_ENV : LOCAL_COMMERCE_ENV) };
const port = kind === "prodlike" ? PRODLIKE_PORT : 3470;
spawn("npx", ["next", "start", "-p", String(port)], { stdio: "inherit", env, shell: process.platform === "win32" });
