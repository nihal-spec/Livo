import Link from "next/link";
import { prisma } from "@livo/db";
import { formatPaise } from "@livo/schemas";
import { searchAccommodation } from "@/modules/search/index.js";
import { parseAccommodationSearchParams } from "@/modules/search/query.js";
import { ListingCard } from "@/components/patterns/ListingCard.js";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "price", label: "Lowest price" },
  { value: "total_cost", label: "Lowest total cost" },
  { value: "closest", label: "Closest" },
] as const;

/**
 * Search results (UX_UI_SPEC.md §5.6). List-only for now — the map view
 * (MapLibre + tile provider, ADR-010) is not wired up yet; the list is
 * fully usable on its own, which the spec requires regardless
 * ("Map unavailable" must never block search).
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
