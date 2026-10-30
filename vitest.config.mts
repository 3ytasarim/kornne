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
    globalSetup: ["tests/integration/global-setup.ts"],
  },
});
