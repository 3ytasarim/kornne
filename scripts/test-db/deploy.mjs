// Integration-test database: applies the SAME migrations to the LOCAL `kornne_it` database (scripts/test-db/local-pg.mjs).
// Since Sprint 8+9 no test writes to Neon — not even to a separate schema there. Additive: `prisma migrate deploy` only.
// Usage: node scripts/test-db/deploy.mjs   (local server must be running: node scripts/test-db/local-pg.mjs start)
import { execFileSync } from "node:child_process";
import { testDatabaseUrl } from "../../tests/test-db-url.mjs";

const url = testDatabaseUrl("it"); // throws unless 127.0.0.1:<kornne port>/kornne_it
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
  stdio: ["ignore", "pipe", "inherit"],
  env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
})
  .toString()
  .split("\n")
  .filter((l) => !/postgres(ql)?:\/\//i.test(l))
  .forEach((l) => l && console.log(l));
console.log("local integration database kornne_it is up to date");
