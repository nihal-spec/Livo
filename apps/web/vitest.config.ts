import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15_000,
  },
});
