import { AccommodationSearchQuery } from "@livo/schemas";
import type { z } from "zod";

/**
 * Coerces raw string query params (from a URL, whether a fetch request or
 * an RSC's `searchParams`) into the shape AccommodationSearchQuery expects,
 * then validates. Shared by the API route and the search results page so
 * both parse identically (API_SPEC.md §2).
 */
export function parseAccommodationSearchParams(
  raw: Record<string, string | string[] | undefined>,
): z.SafeParseReturnType<unknown, AccommodationSearchQuery> {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    flat[k] = Array.isArray(v) ? v[0] : v;
  }

  const candidate: Record<string, unknown> = { ...flat };
  for (const key of ["kinds", "amenities"] as const) {
    if (typeof flat[key] === "string") candidate[key] = flat[key].split(",").filter(Boolean);
  }
  for (const key of ["ac", "privateBath", "foodIncluded", "verifiedOnly"] as const) {
    if (flat[key] != null) candidate[key] = flat[key] === "true";
  }
  for (const key of ["people", "priceMin", "priceMax", "maxCommuteMin", "limit"] as const) {
    if (flat[key] != null) candidate[key] = Number(flat[key]);
  }
  if (flat.radiusKm != null) candidate.radiusKm = Number(flat.radiusKm);

  return AccommodationSearchQuery.safeParse(candidate);
}
