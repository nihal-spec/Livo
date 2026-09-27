import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@livo/db";
import { formatPaise } from "@livo/schemas";
import { searchAccommodation } from "@/modules/search/index.js";
import { parseAccommodationSearchParams } from "@/modules/search/query.js";
import { ListingCard } from "@/components/patterns/ListingCard.js";
import { CompareBar } from "@/components/patterns/CompareBar.js";
import { MapView } from "@/components/patterns/MapView.js";
import { accommodationMarkers, centerOf } from "@/lib/mapMarkers.js";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "price", label: "Lowest price" },
  { value: "total_cost", label: "Lowest total cost" },
  { value: "closest", label: "Closest" },
] as const;

/**
 * Search results (UX_UI_SPEC.md §5.6). The map (ADR-010: MapLibre + OSM
 * tiles) sits alongside the list, never in front of it — per the spec's
 * own edge case, the list must stay fully usable even when the map can't
 * load (no WebGL, tile fetch failure, etc.), so it's laid out and
 * rendered independently of MapView's own success/failure state.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!searchParams.destinationId) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Choose a destination to search</h1>
        <p className="mt-2 text-slate-600">
          Go back to the <Link href="/" className="text-teal-700 underline">homepage</Link> and pick where you need
          to be.
        </p>
      </main>
    );
  }

  const parsed = parseAccommodationSearchParams(searchParams);
  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-xl font-semibold text-red-700">Invalid search</h1>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
          {parsed.error.issues.map((i, idx) => (
            <li key={idx}>
              {i.path.join(".")}: {i.message}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  let result;
  try {
    result = await searchAccommodation(parsed.data);
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === "NOT_FOUND") {
      return (
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-slate-900">We couldn&apos;t find that destination</h1>
          <Link href="/" className="mt-2 inline-block text-teal-700 underline">
            Start a new search
          </Link>
        </main>
      );
    }
    throw err;
  }

  const anchors = await prisma.destination.findMany({ where: { isAnchor: true }, orderBy: { name: "asc" } });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Places to stay near {result.destination.name}
        </h1>
        <p className="text-sm text-slate-600">
          {result.facets.counts.total} places within {parsed.data.radiusKm} km · {result.facets.counts.verified}{" "}
          verified
        </p>
        <Link href={`/food?destinationId=${result.destination.id}`} className="text-sm text-teal-700 underline">
          Find food nearby →
        </Link>
      </header>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4">
        <input type="hidden" name="destinationId" value={parsed.data.destinationId} />
        <label className="flex flex-col text-sm">
          Destination
          <select
            name="destinationId"
            defaultValue={parsed.data.destinationId}
            className="rounded border border-slate-300 px-2 py-1"
          >
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Sort
          <select name="sort" defaultValue={parsed.data.sort} className="rounded border border-slate-300 px-2 py-1">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Max monthly (₹)
          <input
            type="number"
            name="priceMax"
            defaultValue={parsed.data.priceMax}
            className="w-28 rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input type="checkbox" name="foodIncluded" value="true" defaultChecked={parsed.data.foodIncluded} />
          Food included
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
          Update
        </button>
      </form>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
        {result.items.length === 0 ? (
          <EmptyState nearMisses={result.nearMisses} />
        ) : (
          <ul className="space-y-3">
            {result.items.map((item) => (
              <ListingCard
                key={`${item.placeId}-${item.room.id}`}
                item={item}
                destinationId={result.destination.id}
                destinationName={result.destination.name}
              />
            ))}
          </ul>
        )}

        {result.items.length > 0 && (
          <div className="mt-6 h-72 lg:sticky lg:top-6 lg:mt-0 lg:h-[calc(100vh-3rem)] lg:max-h-[600px]">
            <MapView
              markers={accommodationMarkers(result.items)}
              center={centerOf(
                result.items.map((i) => i.location),
                result.items[0].location,
              )}
            />
          </div>
        )}
      </div>

      <Suspense fallback={null}>
        <CompareBar destinationId={result.destination.id} />
      </Suspense>
    </main>
  );
}

function EmptyState({ nearMisses }: { nearMisses?: { cheapestOverBudgetPaise: bigint | null } }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <p className="font-medium text-slate-900">Nothing matches those filters yet.</p>
      {nearMisses?.cheapestOverBudgetPaise != null && (
        <p className="mt-1 text-sm text-slate-600">
          The cheapest option nearby is {formatPaise(nearMisses.cheapestOverBudgetPaise)}/mo — try raising your
          budget.
        </p>
      )}
    </div>
  );
}
