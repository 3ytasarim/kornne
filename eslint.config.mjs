import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-prodlike/**", ".test-db/**", ".pw-browsers/**", "out/**", "next-env.d.ts", "src/generated/**", "data/**", "test-results/**", "playwright-report/**"]),
]);
