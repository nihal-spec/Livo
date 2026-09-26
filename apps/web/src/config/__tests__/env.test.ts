import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The app must refuse to boot on invalid config (ARCHITECTURE.md §9). Since
 * `env.ts` validates at import time, each case resets modules and mutates
 * process.env before re-importing.
 */
describe("env", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("loads successfully with a valid DATABASE_URL", async () => {
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/livo_dev";
    const { env } = await import("../env.js");
    expect(env.DATABASE_URL).toContain("livo_dev");
    expect(env.NODE_ENV).toBe("test");
  });

  it("throws when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    await expect(import("../env.js")).rejects.toThrow(/Invalid environment configuration/);
  });

  it("throws when DATABASE_URL is not a postgres connection string", async () => {
    process.env.DATABASE_URL = "not-a-url";
    await expect(import("../env.js")).rejects.toThrow(/Invalid environment configuration/);
  });
});
