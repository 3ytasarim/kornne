import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `server-only` throws outside the React server runtime → stubbed for unit tests (Kliniva-AI vitest.config.mts pattern).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
    // integration files share one isolated DB schema → run files one after another
    fileParallelism: false,
    environment: "node",
    // never contact TCMB from tests (src/lib/fx/rates.ts)
    env: { FX_FIXTURE: "USD:50.1981,EUR:56.3795" },
    globalSetup: ["tests/integration/global-setup.ts"],
  },
});
