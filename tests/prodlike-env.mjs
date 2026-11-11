/** Offline production-like preview (Sprint 8): production SEO switches ON, but only on localhost with the local DB copy. */
export const PRODLIKE_PORT = 3471;
export const PRODLIKE_ENV = {
  NEXT_DIST_DIR: ".next-prodlike",
  // fixed TCMB rates: tests never contact TCMB (src/lib/fx/rates.ts)
  FX_FIXTURE: "USD:50.1981,EUR:56.3795",
  SITE_INDEXABLE: "true",
  CATALOG_DATA_VERIFIED: "true",
  SITE_URL: `http://localhost:${PRODLIKE_PORT}`,
  // 2026-11: all languages indexable (production default); SEO_LOCALES unset
  // Sprint 10: consent / analytics tests. FAKE test-only ids — Playwright aborts every request to Google hosts.
  ANALYTICS_ENABLED: "true",
  ANALYTICS_GA4_MEASUREMENT_ID: "G-KORNNETEST0",
  GOOGLE_SITE_VERIFICATION: "kornne-test-verification-token-0000",
};
