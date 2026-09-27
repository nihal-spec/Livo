"use client";

import { useRouter, useSearchParams } from "next/navigation";

const MAX_COMPARE = 3;

function parseCompareIds(searchParams: URLSearchParams): string[] {
  const raw = searchParams.get("compare");
  return raw ? raw.split(",").filter(Boolean) : [];
}

/**
 * UX_UI_SPEC.md §5.6: "Compare tray persists across results (bottom bar
 * 'Compare (2)')". State lives in the URL's `compare` param (not
 * component/localStorage state) so the tray survives a page reload and the
 * comparison itself is a shareable link.
 */
export function CompareToggle({ compareId }: { compareId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ids = parseCompareIds(searchParams);
  const checked = ids.includes(compareId);
  const atLimit = !checked && ids.length >= MAX_COMPARE;

  function toggle() {
    const next = checked ? ids.filter((id) => id !== compareId) : [...ids, compareId].slice(0, MAX_COMPARE);
    const params = new URLSearchParams(searchParams.toString());
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
