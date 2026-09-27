import Link from "next/link";
import { prisma } from "@livo/db";
import { searchFood } from "@/modules/search/food.js";
import { parseFoodSearchParams } from "@/modules/search/foodQuery.js";
import { FoodListingCard } from "@/components/patterns/FoodListingCard.js";
import { MapView } from "@/components/patterns/MapView.js";
import { centerOf, foodMarkers } from "@/lib/mapMarkers.js";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "price", label: "Lowest price" },
  { value: "closest", label: "Closest" },
] as const;

/**
 * Food search (mess/tiffin/restaurant/cloud kitchen) — parity with
 * /search for accommodation, per MASTER_PLAN.md §2's MVP scope
 * ("messes and tiffin services"). List-only, same as accommodation search.
 */
export default async function FoodSearchPage({
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

  const parsed = parseFoodSearchParams(searchParams);
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
    result = await searchFood(parsed.data);
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
        <h1 className="text-xl font-semibold text-slate-900">Food near {result.destination.name}</h1>
        <p className="text-sm text-slate-600">
          {result.facets.counts.total} places within {parsed.data.radiusKm} km
        </p>
        <Link href={`/search?destinationId=${result.destination.id}`} className="text-sm text-teal-700 underline">
          ← Back to places to stay
        </Link>
      </header>

      <form method="GET" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4">
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
          Max price (₹)
          <input
            type="number"
            name="priceMax"
            defaultValue={parsed.data.priceMax}
            className="w-28 rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm">
          <input type="checkbox" name="vegOnly" value="true" defaultChecked={parsed.data.vegOnly} />
          Veg only
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white">
          Update
        </button>
      </form>

      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-6">
        {result.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
            <p className="font-medium text-slate-900">Nothing matches those filters yet.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {result.items.map((item) => (
              <FoodListingCard
                key={item.foodPlan.id}
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
              markers={foodMarkers(result.items)}
              center={centerOf(
                result.items.map((i) => i.location),
                result.items[0].location,
              )}
            />
          </div>
        )}
      </div>
    </main>
  );
}
