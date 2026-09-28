import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // next-auth's own code does `import ... from "next/server"` with no
      // extension. Next.js's webpack build resolves that fine, but
      // vitest's Node-ESM resolver needs the exact file since Next's
      // package.json has no "exports" map for extensionless subpaths.
      "next/server": "next/server.js",
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 15_000,
    // Without this, vitest externalizes next-auth to Node's native ESM
    // resolver, which bypasses the "next/server" alias above entirely
    // (Vite aliases only apply to modules it processes itself).
    server: { deps: { inline: [/next-auth/, /@auth\/prisma-adapter/] } },
    // e2e/*.spec.ts are Playwright specs (run via `playwright test`, see
    // playwright.config.ts) — vitest's default include pattern also
    // matches *.spec.ts, so without this it tries to run them itself and
    // fails on the unfamiliar `@playwright/test` APIs.
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
