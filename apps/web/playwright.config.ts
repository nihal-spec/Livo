import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config (ARCHITECTURE.md §14). Runs against a real `next start`
 * server backed by the real Postgres/PostGIS dev database — these tests
 * exercise the same code paths the manual curl verification did during
 * development, just automated and repeatable.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // tests share DB state (dev fixtures); avoid races
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3399",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Only set when explicitly provided (e.g. this sandbox's
        // pre-installed browser). Otherwise Playwright uses its own
        // managed install (`playwright install chromium`), which is what
        // CI and any other machine should do.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
    {
      name: "mobile-360",
      use: {
        viewport: { width: 360, height: 800 },
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    // `next dev` rather than build+start: faster to iterate locally, and
    // NODE_ENV=development is what makes the dev-only admin identity
    // header in lib/adminAuth.ts work at all — the admin E2E tests need it.
    command: "pnpm dev -p 3399",
    url: "http://localhost:3399/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
