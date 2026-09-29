"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getCompareIds, hydrateCompareStore, subscribeCompareStore } from "./compareStore.js";

function parseCompareIds(search: string): string[] {
  const raw = new URLSearchParams(search).get("compare");
  return raw ? raw.split(",").filter(Boolean) : [];
}

/**
 * Reads the same synchronous compare store as CompareToggle (see
 * compareStore.ts) rather than `useSearchParams()` directly, so it always
 * reflects the true current selection immediately — including the moment
 * between a checkbox click and that click's router.replace landing.
 */
export function CompareBar({ destinationId }: { destinationId: string }) {
  const searchParams = useSearchParams();
  hydrateCompareStore(parseCompareIds(searchParams.toString()));

  const ids = useSyncExternalStore(subscribeCompareStore, getCompareIds, getCompareIds);
  if (ids.length < 2) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-5">
      <Link
        href={`/compare?items=${ids.join(",")}&destinationId=${destinationId}`}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lift transition-transform hover:scale-[1.02] hover:bg-slate-800"
      >
        Compare ({ids.length})
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
