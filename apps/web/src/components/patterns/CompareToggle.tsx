"use client";

import { useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCompareIds, hydrateCompareStore, subscribeCompareStore, toggleCompareId, MAX_COMPARE } from "./compareStore.js";

function parseCompareIds(search: string): string[] {
  const raw = new URLSearchParams(search).get("compare");
  return raw ? raw.split(",").filter(Boolean) : [];
}

/**
 * UX_UI_SPEC.md §5.6: "Compare tray persists across results (bottom bar
 * 'Compare (2)')". See compareStore.ts for why this reads/writes a shared
 * synchronous store rather than deriving from `useSearchParams()` — that
 * approach raced when two checkboxes were ticked in quick succession
 * (found by Playwright, not by manual testing).
 */
export function CompareToggle({ compareId }: { compareId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  hydrateCompareStore(parseCompareIds(searchParams.toString()));

  const ids = useSyncExternalStore(subscribeCompareStore, getCompareIds, getCompareIds);
  const checked = ids.includes(compareId);
  const atLimit = !checked && ids.length >= MAX_COMPARE;

  function toggle() {
    const next = toggleCompareId(compareId);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) params.set("compare", next.join(","));
    else params.delete("compare");
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
      <input type="checkbox" checked={checked} disabled={atLimit} onChange={toggle} />
      Compare
    </label>
  );
}
