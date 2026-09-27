import { FoodSearchQuery } from "@livo/schemas";
import type { z } from "zod";

/** Parity with query.ts's parseAccommodationSearchParams — shared shape, food-specific fields. */
export function parseFoodSearchParams(
  raw: Record<string, string | string[] | undefined>,
): z.SafeParseReturnType<unknown, FoodSearchQuery> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    const value = Array.isArray(v) ? v[0] : v;
    if (value === "") continue; // an empty form field (e.g. "Max price" left blank) means "not set", not 0
    flat[k] = value;
  }

  const candidate: Record<string, unknown> = { ...flat };
  if (typeof flat.kinds === "string") candidate.kinds = flat.kinds.split(",").filter(Boolean);
  if (flat.vegOnly != null) candidate.vegOnly = flat.vegOnly === "true";
  if (flat.priceMax != null) candidate.priceMax = Number(flat.priceMax);
  if (flat.limit != null) candidate.limit = Number(flat.limit);
  if (flat.radiusKm != null) candidate.radiusKm = Number(flat.radiusKm);

  return FoodSearchQuery.safeParse(candidate);
}
