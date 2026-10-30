/** Offline production-like preview (Sprint 8): production SEO switches ON, but only on localhost with the local DB copy. */
export const PRODLIKE_PORT = 3471;
export const PRODLIKE_ENV = {
  NEXT_DIST_DIR: ".next-prodlike",
  SITE_INDEXABLE: "true",
  CATALOG_DATA_VERIFIED: "true",
  SITE_URL: `http://localhost:${PRODLIKE_PORT}`,
  SEO_LOCALES: "tr",
  // Sprint 10: consent / analytics tests. FAKE test-only ids — Playwright aborts every request to Google hosts.
  ANALYTICS_ENABLED: "true",
  ANALYTICS_GA4_MEASUREMENT_ID: "G-KORNNETEST0",
  GOOGLE_SITE_VERIFICATION: "kornne-test-verification-token-0000",
};
