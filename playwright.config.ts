import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/test-db-url.mjs";
import { PRODLIKE_ENV, PRODLIKE_PORT } from "./tests/prodlike-env.mjs";
import { LOCAL_COMMERCE_ENV } from "./tests/local-commerce-env.mjs";

/**
 * E2E against the PRODUCTION build (`next start`). Uses the system Chrome (no browser download).
 * Traces/videos are off: the admin test types a throwaway password and artifacts must never contain it.
 *
 * ISOLATION (Sprint 8+9): the app server under test runs on its OWN port with DATABASE_URL forced to the local,
 * disposable `kornne_e2e` copy (scripts/test-db/local-pg.mjs) — never Neon. `reuseExistingServer: false` so a dev
 * server that might point at Neon is never reused. testDatabaseUrl() throws for any non-local target.
 */
const DB = testDatabaseUrl("e2e");
const PORT = 3470;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // admin actions run several DB round-trips + an RSC refresh: give UI outcomes time to appear
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    { name: "chrome", testIgnore: /\.prodlike\.spec\.ts$/, use: { ...devices["Desktop Chrome"], channel: "chrome" } },
    // Sprint 10: cross-browser engines (Playwright builds: Chromium, Firefox, WebKit ≠ real Safari) — storefront spec only
    { name: "chromium", testMatch: /\.xbrowser\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testMatch: /\.xbrowser\.spec\.ts$/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /\.xbrowser\.spec\.ts$/, use: { ...devices["Desktop Safari"] } },
    // Sprint 8: offline production-like preview (separate .next-prodlike build, same local DB copy)
    { name: "prodlike", testMatch: /\.prodlike\.spec\.ts$/, use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: `http://localhost:${PRODLIKE_PORT}` } },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { DATABASE_URL: DB, DIRECT_URL: DB, KORNNE_TEST_DB: "local-e2e", ...LOCAL_COMMERCE_ENV },
    },
    {
      command: `npx next start -p ${PRODLIKE_PORT}`,
      url: `http://localhost:${PRODLIKE_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { DATABASE_URL: DB, DIRECT_URL: DB, KORNNE_TEST_DB: "local-e2e", ...PRODLIKE_ENV },
    },
  ],
});
