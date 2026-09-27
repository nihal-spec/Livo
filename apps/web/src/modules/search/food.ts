import { prisma } from "@livo/db";
import { findFoodCandidates } from "@livo/db/geo";
import type { FoodSearchQuery, FoodSearchResponse, FoodSearchItem, ReasonCode } from "@livo/schemas";

/**
 * Food search service — parity with modules/search/index.ts
 * (searchAccommodation), but simpler: no commute-cost stacking, since a
 * food plan's price doesn't roll into a room's rent basis the way an
 * accommodation candidate's does. Same "no opaque score" rule (ADR-014):
 * hard filters, then an explicit reason per result, no ranking model.
 */

function median(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2n : sorted[mid];
}

export async function searchFood(query: FoodSearchQuery): Promise<FoodSearchResponse> {
  const destination = await prisma.destination.findUnique({ where: { id: query.destinationId } });
  if (!destination) {
    throw Object.assign(new Error("Unknown destination"), { code: "NOT_FOUND" as const });
  }

  const radiusM = query.radiusKm * 1000;
  const priceMaxPaise = query.priceMax != null ? BigInt(Math.round(query.priceMax * 100)) : undefined;

  const candidates = await findFoodCandidates({
    destinationId: query.destinationId,
    radiusM,
    priceMaxPaise,
    vegOnly: query.vegOnly,
    kinds: query.kinds,
    limit: 500,
  });

  const prices = candidates.map((c) => c.pricePaise);
  const medianPrice = median(prices);
  const closestDistance = candidates.length > 0 ? Math.min(...candidates.map((c) => c.distanceM)) : null;

  const items: FoodSearchItem[] = candidates.map((c) => {
    const reasons: Array<{ code: ReasonCode; value?: string }> = [];
    if (medianPrice > 0n && c.pricePaise < medianPrice) {
      reasons.push({ code: "CHEAPER_THAN_MEDIAN", value: (medianPrice - c.pricePaise).toString() });
    }
    if (closestDistance != null && c.distanceM === closestDistance) reasons.push({ code: "CLOSEST_MATCH" });
    if (c.distanceM <= 1500) reasons.push({ code: "WITHIN_WALK" });
    if (c.vegOnly) reasons.push({ code: "VEG_ONLY" });
    if (c.delivers) reasons.push({ code: "DELIVERS" });

    return {
      placeId: c.placeId,
      slug: c.slug,
      name: c.name,
      kind: c.foodKind as FoodSearchItem["kind"],
      location: { lat: c.lat, lng: c.lng },
      foodPlan: {
        id: c.foodPlanId,
        vegOnly: c.vegOnly,
        delivers: c.delivers,
        meals: c.meals,
        pricePaise: c.pricePaise,
        priceBasis: c.priceBasis as FoodSearchItem["foodPlan"]["priceBasis"],
      },
      distanceM: Math.round(c.distanceM),
      reasons,
    };
  });

  const sorted = sortItems(items, query);
  const page = sorted.slice(0, query.limit);
  const nextCursor = sorted.length > query.limit ? String(query.limit) : null;

  const kindCounts: Record<string, number> = {};
  for (const item of sorted) kindCounts[item.kind] = (kindCounts[item.kind] ?? 0) + 1;

  return {
    destination: { id: destination.id, name: destination.name },
    items: page,
    facets: { kinds: kindCounts, counts: { total: sorted.length } },
    nextCursor,
    dataVersion: new Date().toISOString(),
  };
}

function sortItems(items: FoodSearchItem[], query: FoodSearchQuery): FoodSearchItem[] {
  const byPrice = (a: FoodSearchItem, b: FoodSearchItem) =>
    a.foodPlan.pricePaise < b.foodPlan.pricePaise ? -1 : a.foodPlan.pricePaise > b.foodPlan.pricePaise ? 1 : 0;
  const byDistance = (a: FoodSearchItem, b: FoodSearchItem) => a.distanceM - b.distanceM;

  switch (query.sort) {
    case "price":
      return [...items].sort(byPrice);
    case "closest":
      return [...items].sort(byDistance);
    case "recommended":
    default:
      return [...items].sort(byDistance);
  }
}
