"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const MAX_COMPARE = 3;

function parseCompareIds(search: string): string[] {
  const raw = new URLSearchParams(search).get("compare");
  return raw ? raw.split(",").filter(Boolean) : [];
}

/**
 * UX_UI_SPEC.md §5.6: "Compare tray persists across results (bottom bar
 * 'Compare (2)')". The URL's `compare` param is the source of truth (so
 * the tray survives a reload and the comparison is a shareable link).
 *
 * Two things this component has to get right, both found by an E2E run
 * rather than by reading the code:
 *
 * 1. A checkbox whose `checked` prop is driven *only* by `useSearchParams`
 *    flickers or silently fails to toggle on a fast click, because
 *    `router.push` re-renders this page from the server and that round
 *    trip takes time. Local optimistic state (below) fixes the visual
 *    toggle; the effect reconciles it back once the round trip lands.
 * 2. Checking two of these checkboxes in quick succession is a real,
 *    user-reachable race, not just a test artifact: each independent
 *    instance computed its "next compare list" from React's
 *    `useSearchParams()`, which only updates *after* the *previous*
 *    push's round trip commits. Two rapid clicks each read the same
 *    stale (still-empty) list and each `router.push` a URL containing
 *    only its own id — the second push wins and the first selection is
 *    silently dropped. Fixed by reading `window.location.search`
 *    synchronously inside the click handler instead of the closed-over,
 *    round-trip-delayed `searchParams` value.
 */
export function CompareToggle({ compareId }: { compareId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlChecked = parseCompareIds(searchParams.toString()).includes(compareId);
  const [checked, setChecked] = useState(urlChecked);

  useEffect(() => setChecked(urlChecked), [urlChecked]);

  const atLimit = !checked && parseCompareIds(searchParams.toString()).length >= MAX_COMPARE;

  function toggle() {
    // Always the current URL, not the possibly-stale value this render
    // closed over — see point 2 above.
    const currentSearch = window.location.search;
    const ids = parseCompareIds(currentSearch);
    const isChecked = ids.includes(compareId);
    const next = isChecked ? ids.filter((id) => id !== compareId) : [...ids, compareId].slice(0, MAX_COMPARE);

    setChecked(!isChecked);
    const params = new URLSearchParams(currentSearch);
    if (next.length > 0) params.set("compare", next.join(","));
    else params.delete("compare");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
      <input type="checkbox" checked={checked} disabled={atLimit} onChange={toggle} />
      Compare
    </label>
  );
}
