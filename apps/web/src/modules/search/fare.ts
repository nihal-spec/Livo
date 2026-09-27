import { prisma } from "@livo/db";

/**
 * Auto fare-rule lookup and calculation, shared by the search service
 * (ranking's monthly-cost estimate) and the plan budget builder (so a
 * saved plan's budget matches what search showed for the same room).
 * DATA_STRATEGY.md §5 / §8: fare parameters are versioned, region-scoped
 * rows — never invented at request time.
 */

export const WEEKS_PER_MONTH = 4.345;
export const DEFAULT_TRIPS_PER_WEEK = 5;

export interface AutoFareParams {
  minFarePaise: bigint;
  minKm: number;
  perKmPaise: bigint;
}

export async function getAutoFareRule(regionId: string): Promise<AutoFareParams | null> {
  const row = await prisma.fareRule.findFirst({
    where: { regionId, mode: "AUTO", effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!row) return null;
  const params = row.params as { minFarePaise: string; minKm: number; perKmPaise: string };
  return {
    minFarePaise: BigInt(params.minFarePaise),
    minKm: params.minKm,
    perKmPaise: BigInt(params.perKmPaise),
  };
}

export function autoFareForDistance(distanceM: number, rule: AutoFareParams): bigint {
  const km = distanceM / 1000;
  if (km <= rule.minKm) return rule.minFarePaise;
  const extraKm = km - rule.minKm;
  return rule.minFarePaise + BigInt(Math.round(extraKm * Number(rule.perKmPaise)));
}

/** Normalizes any price basis to a monthly-equivalent, for comparing prices across listings. */
export function normalizeToMonthlyPaise(pricePaise: bigint, basis: string): bigint {
  switch (basis) {
    case "PER_MONTH":
      return pricePaise;
    case "PER_NIGHT":
    case "PER_DAY":
      return BigInt(Math.round(Number(pricePaise) * 30));
    case "PER_WEEK":
      return BigInt(Math.round(Number(pricePaise) * WEEKS_PER_MONTH));
    default:
      return pricePaise;
  }
}
