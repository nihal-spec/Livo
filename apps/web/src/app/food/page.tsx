import Link from "next/link";
import { ArrowLeft, BedDouble, SearchX, SlidersHorizontal } from "lucide-react";
import { prisma } from "@livo/db";
import { searchFood } from "@/modules/search/food.js";
import { parseFoodSearchParams } from "@/modules/search/foodQuery.js";
import { FoodListingCard } from "@/components/patterns/FoodListingCard.js";
import { MapView } from "@/components/patterns/MapView.js";
import { centerOf, foodMarkers } from "@/lib/mapMarkers.js";
import { ButtonLink, EmptyState, Field, buttonClass, fieldClass } from "@/components/ui/index.js";
import { resolveViewerReadOnly } from "@/modules/auth/index.js";
import { findOwnedPlan } from "@/modules/plans/index.js";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "price", label: "Lowest price" },
  { value: "closest", label: "Closest" },
] as const;

/**
 * Food search (mess/tiffin/restaurant/cloud kitchen) — parity with
 * /search for accommodation, per MASTER_PLAN.md §2's MVP scope. Inside the
 * plan wizard (?planId=), "Add to plan" sets that plan's food.
 */
export default async function FoodSearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!searchParams.destinationId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <EmptyState
          title="Choose a destination to search"
          description="Tell us where you need to be and we'll show food options nearby."
          action={<ButtonLink href="/">Start a plan</ButtonLink>}
        />
      </main>
    );
  }

  const parsed = parseFoodSearchParams(searchParams);
  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <EmptyState
          title="Invalid search"
          description={parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ")}
          action={<ButtonLink href="/">Start over</ButtonLink>}
        />
      </main>
    );
  }

  let result;
  try {
    result = await searchFood(parsed.data);
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === "NOT_FOUND") {
      return (
        <main className="mx-auto max-w-xl px-4 py-20">
          <EmptyState title="We couldn't find that destination" action={<ButtonLink href="/">Start a new search</ButtonLink>} />
        </main>
      );
    }
    throw err;
  }

  const planIdRaw = typeof searchParams.planId === "string" ? searchParams.planId : undefined;
  const [anchors, plan] = await Promise.all([
    prisma.destination.findMany({ where: { isAnchor: true }, orderBy: { name: "asc" } }),
    planIdRaw ? resolveViewerReadOnly().then((v) => findOwnedPlan(planIdRaw, v)) : null,
  ]);
  const planId = plan?.id;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {plan && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-card">
          <p className="text-sm">
            <span className="text-slate-300">Step 2 · Choosing food for</span>{" "}
            <span className="font-semibold">{plan.title}</span>
          </p>
          <Link href={`/plan/${plan.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-white/90 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to plan
          </Link>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Food near {result.destination.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {result.facets.counts.total} places within {parsed.data.radiusKm} km
          </p>
        </div>
        <Link
          href={`/search?destinationId=${result.destination.id}${planId ? `&planId=${planId}` : ""}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <BedDouble className="h-4 w-4" aria-hidden />
          ← Back to places to stay
        </Link>
      </div>

      <form method="GET" className="mb-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
        {planId && <input type="hidden" name="planId" value={planId} />}
        <input type="hidden" name="radiusKm" value={parsed.data.radiusKm} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto] lg:items-end">
          <Field label="Destination">
            <select name="destinationId" defaultValue={parsed.data.destinationId} className={fieldClass}>
              {anchors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort">
            <select name="sort" defaultValue={parsed.data.sort} className={fieldClass}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Max price (₹)">
            <input type="number" name="priceMax" defaultValue={parsed.data.priceMax} placeholder="Any" className={fieldClass} />
          </Field>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700">
            <input type="checkbox" name="vegOnly" value="true" defaultChecked={parsed.data.vegOnly} className="h-4 w-4 accent-brand-600" />
            Veg only
          </label>
          <button type="submit" className={buttonClass("primary", "md", "h-11")}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Update
          </button>
        </div>
      </form>

      <div className="lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-6">
        {result.items.length === 0 ? (
          <EmptyState
            icon={<SearchX className="h-5 w-5" />}
            title="Nothing matches those filters yet."
            description="Try widening your search or turning off a filter."
          />
        ) : (
          <ul className="space-y-4">
            {result.items.map((item) => (
              <FoodListingCard
                key={item.foodPlan.id}
                item={item}
                destinationId={result.destination.id}
                destinationName={result.destination.name}
                planId={planId}
              />
            ))}
          </ul>
        )}

        {result.items.length > 0 && (
          <div className="mt-6 h-72 overflow-hidden rounded-2xl border border-slate-200 shadow-card lg:sticky lg:top-24 lg:mt-0 lg:h-[calc(100vh-8rem)] lg:max-h-[640px]">
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
