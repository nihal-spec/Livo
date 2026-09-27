"use client";

/**
 * Shared, synchronous client-side state for the compare selection
 * (UX_UI_SPEC.md §5.6). This exists because the previous approach — each
 * `CompareToggle` computing its "next" list from `useSearchParams()` and
 * calling `router.push` — has an inherent race: `useSearchParams()` only
 * reflects a *previous* `router.push` once that navigation's round trip
 * commits, so two checkboxes ticked in quick succession can each read the
 * same stale list and each push a URL containing only their own id,
 * silently dropping the other's selection. This was caught by a
 * Playwright E2E run, not by manual testing, and reading
 * `window.location.search` synchronously (a first attempt at fixing it)
 * only narrowed the window rather than closing it, since `router.push`'s
 * `history.pushState` call is not guaranteed to be synchronous with the
 * click handler that triggered it.
 *
 * A plain module-level array is genuinely race-free here: JavaScript is
 * single-threaded, so two click handlers never interleave — each runs to
 * completion (including its synchronous mutation of `ids` below) before
 * the next one starts. The URL is still kept in sync (for shareability
 * and reload-persistence, per the spec) via `router.replace`, but that
 * sync is a side effect *after* the source of truth has already updated,
 * not a dependency the next click has to wait on.
 */

export const MAX_COMPARE = 3;

let ids: string[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Called once by the first mounted instance to seed state from the URL. Idempotent. */
export function hydrateCompareStore(initialIds: string[]): void {
  if (hydrated) return;
  ids = initialIds;
  hydrated = true;
}

export function getCompareIds(): string[] {
  return ids;
}

export function subscribeCompareStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Synchronously toggles `id` and returns the new full list. */
export function toggleCompareId(id: string): string[] {
  ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, MAX_COMPARE);
  notify();
  return ids;
}
