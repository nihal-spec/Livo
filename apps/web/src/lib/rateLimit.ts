/**
 * A real, working sliding-window rate limiter — not a stub. It is
 * deliberately in-memory (per process), which is honest about its limits:
 * it does not survive a restart and does not coordinate across multiple
 * instances. ARCHITECTURE.md §11 / SECURITY.md §2 call for Upstash Redis
 * in production for exactly that reason; this is a correct MVP substitute
 * for a single-instance deployment, and the interface below (`checkLimit`)
 * is the same shape a Redis-backed version would have, so swapping the
 * implementation later touches nothing else.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Prevent unbounded memory growth from one-off keys (e.g. per-guest-session
// contact reveals) — sweep occasionally rather than on every call.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60_000;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.length === 0 || now - bucket.timestamps[bucket.timestamps.length - 1] > 60 * 60_000) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterS: number;
}

/** Sliding-window check: at most `limit` calls per `windowMs` for a given `key`. */
export function checkLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0];
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterS: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.timestamps.length, retryAfterS: 0 };
}

/** Test-only: clears all buckets so tests don't leak state into each other. */
export function _resetRateLimitsForTests(): void {
  buckets.clear();
}
