import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, SearchX, SlidersHorizontal, Sparkles, UtensilsCrossed } from "lucide-react";
import { prisma } from "@livo/db";
import { formatPaise } from "@livo/schemas";
import { searchAccommodation } from "@/modules/search/index.js";
import { parseAccommodationSearchParams } from "@/modules/search/query.js";
import { ListingCard } from "@/components/patterns/ListingCard.js";
import { CompareBar } from "@/components/patterns/CompareBar.js";
import { MapView } from "@/components/patterns/MapView.js";
import { accommodationMarkers, centerOf } from "@/lib/mapMarkers.js";
import { ButtonLink, EmptyState, Field, Notice, buttonClass, fieldClass } from "@/components/ui/index.js";
import { resolveViewerReadOnly } from "@/modules/auth/index.js";
import { findOwnedPlan } from "@/modules/plans/index.js";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "price", label: "Lowest price" },
  { value: "total_cost", label: "Lowest total cost" },
  { value: "closest", label: "Closest" },
] as const;

/**
 * Search results (UX_UI_SPEC.md §5.6). Inside the plan wizard (?planId=)
 * the page shows which plan you're choosing for and "Add to plan" sets
 * that plan's stay. The map sits beside the list, never in front of it —
 * per the spec, the list must stay usable even when the map can't load.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!searchParams.destinationId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <EmptyState
          title="Choose a destination to search"
          description="Tell us where you need to be and we'll show places nearby."
          action={<ButtonLink href="/">Start a plan</ButtonLink>}
        />
      </main>
    );
  }

  const parsed = parseAccommodationSearchParams(searchParams);
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
    result = await searchAccommodation(parsed.data);
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === "NOT_FOUND") {
      return (
        <main className="mx-auto max-w-xl px-4 py-20">
          <EmptyState
            title="We couldn't find that destination"
            action={<ButtonLink href="/">Start a new search</ButtonLink>}
          />
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
  const aiNote = typeof searchParams.aiNote === "string" ? searchParams.aiNote : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {plan && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-card">
          <p className="text-sm">
            <span className="text-slate-300">Step 1 · Choosing a stay for</span>{" "}
            <span className="font-semibold">{plan.title}</span>
          </p>
          <Link href={`/plan/${plan.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-white/90 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to plan
          </Link>
        </div>
      )}

      {aiNote && (
        <div className="mb-5">
          <Notice icon={<Sparkles className="h-4 w-4" />}>{aiNote}</Notice>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Places to stay near {result.destination.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {result.facets.counts.total} places within {parsed.data.radiusKm} km · prices include your estimated food
            &amp; commute in the monthly total
          </p>
        </div>
        <Link
          href={`/food?destinationId=${result.destination.id}${planId ? `&planId=${planId}` : ""}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
        >
          <UtensilsCrossed className="h-4 w-4" aria-hidden />
          Find food nearby →
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
          <Field label="Max monthly (₹)">
            <input type="number" name="priceMax" defaultValue={parsed.data.priceMax} placeholder="Any" className={fieldClass} />
          </Field>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              name="foodIncluded"
              value="true"
              defaultChecked={parsed.data.foodIncluded}
              className="h-4 w-4 accent-brand-600"
            />
            Food included
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
            description={
              result.nearMisses?.cheapestOverBudgetPaise != null
                ? `The cheapest option nearby is ${formatPaise(result.nearMisses.cheapestOverBudgetPaise)}/mo — try raising your budget.`
                : "Try a higher budget, or turn off a filter."
            }
          />
        ) : (
          <ul className="space-y-4">
            {result.items.map((item) => (
              <ListingCard
                key={`${item.placeId}-${item.room.id}`}
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
