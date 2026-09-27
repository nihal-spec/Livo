import { prisma } from "@livo/db";
import { findAccommodationCandidates } from "@livo/db/geo";
import type {
  AccommodationSearchQuery,
  AccommodationSearchResponse,
  AccommodationSearchItem,
  ReasonCode,
} from "@livo/schemas";
import { estimateByDistance } from "./estimate.js";
import {
  autoFareForDistance,
  getAutoFareRule,
  normalizeToMonthlyPaise,
  DEFAULT_TRIPS_PER_WEEK,
  WEEKS_PER_MONTH,
} from "./fare.js";

/**
 * Search service (ARCHITECTURE.md §3-4). Pipeline: PostGIS radius
 * pre-filter -> attach a travel estimate -> full monthly cost per
 * candidate -> hard constraints -> Pareto rank -> reason chips. No opaque
 * score anywhere (ADR-014).
 */

async function getFoodAssumptionPaise(regionId: string): Promise<bigint | null> {
  const row = await prisma.costAssumption.findFirst({
    where: { key: "food.mess.2meals.monthly", regionId, effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
  });
  return row?.valuePaise ?? null;
}

function median(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2n : sorted[mid];
}

/** Non-dominated (Pareto) rank on (monthlyTotal, commute time): 0 = best front. */
function paretoRanks(items: Array<{ monthlyTotal: bigint; durationMax: number }>): number[] {
  const ranks = new Array(items.length).fill(-1);
  const remaining = items.map((_, i) => i);
  let front = 0;
  while (remaining.length > 0) {
    const frontier: number[] = [];
    for (const i of remaining) {
      const dominated = remaining.some((j) => {
        if (i === j) return false;
        const costLE = items[j].monthlyTotal <= items[i].monthlyTotal;
        const timeLE = items[j].durationMax <= items[i].durationMax;
        const strictlyBetter =
          items[j].monthlyTotal < items[i].monthlyTotal || items[j].durationMax < items[i].durationMax;
        return costLE && timeLE && strictlyBetter;
      });
      if (!dominated) frontier.push(i);
    }
    for (const i of frontier) ranks[i] = front;
    for (const i of frontier) remaining.splice(remaining.indexOf(i), 1);
    front += 1;
  }
  return ranks;
}

export async function searchAccommodation(query: AccommodationSearchQuery): Promise<AccommodationSearchResponse> {
  const destination = await prisma.destination.findUnique({ where: { id: query.destinationId } });
  if (!destination) {
    throw Object.assign(new Error("Unknown destination"), { code: "NOT_FOUND" as const });
  }

  const radiusM = query.radiusKm * 1000;
  const priceMinPaise = query.priceMin != null ? BigInt(Math.round(query.priceMin * 100)) : undefined;
  const priceMaxPaise = query.priceMax != null ? BigInt(Math.round(query.priceMax * 100)) : undefined;

  const candidates = await findAccommodationCandidates({
    destinationId: query.destinationId,
    radiusM,
    priceMinPaise,
    priceMaxPaise,
    ac: query.ac,
    privateBath: query.privateBath,
    limit: 500,
  });

  const [foodAssumptionPaise, autoFareRule] = await Promise.all([
    getFoodAssumptionPaise(destination.regionId),
    getAutoFareRule(destination.regionId),
  ]);

  // Hard filters that the SQL layer doesn't (yet) express.
  const filtered = candidates.filter((c) => {
    if (query.genderPolicy !== "ANY" && c.genderPolicy && c.genderPolicy !== query.genderPolicy) return false;
    if (query.occupancy === "SINGLE" && c.occupancy !== "SINGLE") return false;
    if (query.occupancy === "SHARED" && c.occupancy === "SINGLE") return false;
    if (query.foodIncluded != null && c.foodIncluded !== query.foodIncluded) return false;
    if (query.kinds.length > 0 && (!c.kind || !query.kinds.includes(c.kind as never))) return false;
    return true;
  });

  const enriched = filtered.map((c) => {
    const estimate = estimateByDistance(c.distanceM, query.commuteMode === "ANY" ? undefined : query.commuteMode);
    const monthlyRoomPaise = normalizeToMonthlyPaise(c.pricePaise, c.priceBasis);
    const foodMonthlyPaise = c.foodIncluded ? 0n : (foodAssumptionPaise ?? 0n);

    let fareMinPaise: bigint | null = null;
    let fareMaxPaise: bigint | null = null;
    let commuteMonthlyPaise = 0n;
    if (estimate.mode === "AUTO" && autoFareRule) {
      const oneWay = autoFareForDistance(c.distanceM, autoFareRule);
      fareMinPaise = oneWay;
      fareMaxPaise = oneWay;
      const tripsPerMonth = DEFAULT_TRIPS_PER_WEEK * 2 * WEEKS_PER_MONTH;
      commuteMonthlyPaise = BigInt(Math.round(Number(oneWay) * tripsPerMonth));
    }

    const monthlyTotal = monthlyRoomPaise + foodMonthlyPaise + commuteMonthlyPaise;
    return { c, estimate, monthlyRoomPaise, monthlyTotal, fareMinPaise, fareMaxPaise };
  });

  // maxCommuteMin hard filter (applied after estimation since it depends on it).
  const withinCommute = query.maxCommuteMin
    ? enriched.filter((e) => e.estimate.durationSMax <= query.maxCommuteMin! * 60)
    : enriched;

  const monthlyTotals = withinCommute.map((e) => e.monthlyTotal);
  const medianMonthly = median(monthlyTotals);
  const closestDistance = withinCommute.length > 0 ? Math.min(...withinCommute.map((e) => e.c.distanceM)) : null;

  const ranks = paretoRanks(withinCommute.map((e) => ({ monthlyTotal: e.monthlyTotal, durationMax: e.estimate.durationSMax })));

  const ranked: Array<{ item: AccommodationSearchItem; paretoRank: number }> = withinCommute.map((e, i) => {
    const reasons: Array<{ code: ReasonCode; value?: string }> = [];
    if (e.c.foodIncluded) reasons.push({ code: "FOOD_INCLUDED" });
    if (medianMonthly > 0n && e.monthlyTotal < medianMonthly) {
      reasons.push({ code: "CHEAPER_THAN_MEDIAN", value: (medianMonthly - e.monthlyTotal).toString() });
    }
    if (closestDistance != null && e.c.distanceM === closestDistance) reasons.push({ code: "CLOSEST_MATCH" });
    if (e.c.occupancy === "SINGLE") reasons.push({ code: "PRIVATE_ROOM" });
    if (e.c.distanceM <= 2000) reasons.push({ code: "WITHIN_WALK" });

    const item: AccommodationSearchItem = {
      placeId: e.c.placeId,
      slug: e.c.slug,
      name: e.c.name,
      kind: (e.c.kind ?? "PG") as AccommodationSearchItem["kind"],
      location: { lat: e.c.lat, lng: e.c.lng },
      room: {
        id: e.c.roomId,
        occupancy: e.c.occupancy as AccommodationSearchItem["room"]["occupancy"],
        ac: e.c.ac,
        privateBath: e.c.privateBath,
        pricePaise: e.c.pricePaise,
        priceBasis: e.c.priceBasis as AccommodationSearchItem["room"]["priceBasis"],
        depositPaise: e.c.depositPaise,
      },
      foodIncluded: e.c.foodIncluded,
      commute: {
        mode: e.estimate.mode,
        durationSMin: e.estimate.durationSMin,
        durationSMax: e.estimate.durationSMax,
        distanceM: Math.round(e.c.distanceM),
        fareMinPaise: e.fareMinPaise,
        fareMaxPaise: e.fareMaxPaise,
        method: e.estimate.method,
      },
      monthlyTotalPaise: e.monthlyTotal,
      reasons,
      sponsored: false,
    };
    return { item, paretoRank: ranks[i] };
  });

  const cleaned = sortItems(ranked, query).map((r) => r.item);

  const page = cleaned.slice(0, query.limit);
  const nextCursor = cleaned.length > query.limit ? String(query.limit) : null;

  const kindCounts: Record<string, number> = {};
  for (const item of cleaned) kindCounts[item.kind] = (kindCounts[item.kind] ?? 0) + 1;

  const response: AccommodationSearchResponse = {
    destination: { id: destination.id, name: destination.name },
    items: page,
    facets: {
      kinds: kindCounts,
      counts: { verified: 0, total: cleaned.length },
    },
    nextCursor,
    dataVersion: new Date().toISOString(),
  };

  if (cleaned.length === 0) {
    response.nearMisses = buildNearMisses(enriched, query);
  }

  return response;
}

function sortItems(
  ranked: Array<{ item: AccommodationSearchItem; paretoRank: number }>,
  query: AccommodationSearchQuery,
): Array<{ item: AccommodationSearchItem; paretoRank: number }> {
  const byPrice = (a: AccommodationSearchItem, b: AccommodationSearchItem) =>
    a.room.pricePaise < b.room.pricePaise ? -1 : a.room.pricePaise > b.room.pricePaise ? 1 : 0;
  const byTotalCost = (a: AccommodationSearchItem, b: AccommodationSearchItem) =>
    (a.monthlyTotalPaise ?? 0n) < (b.monthlyTotalPaise ?? 0n)
      ? -1
      : (a.monthlyTotalPaise ?? 0n) > (b.monthlyTotalPaise ?? 0n)
        ? 1
        : 0;
  const byDistance = (a: AccommodationSearchItem, b: AccommodationSearchItem) =>
    (a.commute?.distanceM ?? 0) - (b.commute?.distanceM ?? 0);

  switch (query.sort) {
    case "price":
      return [...ranked].sort((a, b) => byPrice(a.item, b.item));
    case "total_cost":
    case "value":
      return [...ranked].sort((a, b) => byTotalCost(a.item, b.item));
    case "closest":
      return [...ranked].sort((a, b) => byDistance(a.item, b.item));
    case "recommended":
    default:
      return [...ranked].sort((a, b) => {
        if (a.paretoRank !== b.paretoRank) return a.paretoRank - b.paretoRank;
        if (query.priority === "cheapest") return byTotalCost(a.item, b.item);
        if (query.priority === "closest") return byDistance(a.item, b.item);
        return (a.item.commute?.durationSMax ?? 0) - (b.item.commute?.durationSMax ?? 0);
      });
  }
}

function buildNearMisses(
  enrichedBeforeCommuteFilter: Array<{ monthlyTotal: bigint; c: { distanceM: number } }>,
  query: AccommodationSearchQuery,
): NonNullable<AccommodationSearchResponse["nearMisses"]> {
  const relaxations: Array<{ filter: string; wouldAdd: number }> = [];
  if (query.maxCommuteMin) {
    relaxations.push({
      filter: "maxCommuteMin",
      wouldAdd: enrichedBeforeCommuteFilter.length,
    });
  }
  const cheapestOverBudget =
    query.priceMax != null
      ? enrichedBeforeCommuteFilter
          .map((e) => e.monthlyTotal)
          .filter((v) => v > BigInt(Math.round(query.priceMax! * 100)))
          .sort((a, b) => (a < b ? -1 : 1))[0]
      : undefined;

  return {
    cheapestOverBudgetPaise: cheapestOverBudget ?? null,
    closestOutsideRadiusM: null,
    relaxations,
  };
}
