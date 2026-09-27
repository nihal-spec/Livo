import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimitsForTests, checkLimit } from "../rateLimit.js";

describe("checkLimit", () => {
  beforeEach(() => {
    _resetRateLimitsForTests();
    vi.useRealTimers();
  });

  it("allows calls up to the limit and blocks the next one", () => {
    const key = "test-key-1";
    for (let i = 0; i < 3; i++) {
      expect(checkLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterS).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", () => {
    expect(checkLimit("a", 1, 60_000).allowed).toBe(true);
    expect(checkLimit("a", 1, 60_000).allowed).toBe(false);
    expect(checkLimit("b", 1, 60_000).allowed).toBe(true);
  });

  it("allows calls again once the window has passed", () => {
    vi.useFakeTimers();
    const key = "test-key-2";
    expect(checkLimit(key, 1, 1000).allowed).toBe(true);
    expect(checkLimit(key, 1, 1000).allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(checkLimit(key, 1, 1000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("reports decreasing remaining count", () => {
    const key = "test-key-3";
    expect(checkLimit(key, 5, 60_000).remaining).toBe(4);
    expect(checkLimit(key, 5, 60_000).remaining).toBe(3);
  });
});
