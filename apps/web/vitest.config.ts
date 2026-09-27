import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15_000,
    // e2e/*.spec.ts are Playwright specs (run via `playwright test`, see
    // playwright.config.ts) — vitest's default include pattern also
    // matches *.spec.ts, so without this it tries to run them itself and
    // fails on the unfamiliar `@playwright/test` APIs.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
