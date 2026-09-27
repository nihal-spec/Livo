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
    <div className="fixed inset-x-0 bottom-0 flex justify-center pb-4">
      <Link
        href={`/compare?items=${ids.join(",")}&destinationId=${destinationId}`}
        className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-slate-800"
      >
        Compare ({ids.length})
      </Link>
    </div>
  );
}
