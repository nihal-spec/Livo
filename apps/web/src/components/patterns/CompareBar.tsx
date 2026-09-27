"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export function CompareBar({ destinationId }: { destinationId: string }) {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("compare") ?? "").split(",").filter(Boolean);
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
