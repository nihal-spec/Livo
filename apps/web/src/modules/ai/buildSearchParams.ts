import type { TripRequirements } from "@livo/schemas";

/**
 * Maps extracted TripRequirements onto the exact same query-string shape
 * parseAccommodationSearchParams already accepts (modules/search/query.ts)
 * — AI intake never runs its own search or ranking; it only prefills the
 * ordinary, already-tested filter form and hands off to it.
 */
export function buildSearchParams(requirements: TripRequirements, destinationId: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("destinationId", destinationId);

  if (requirements.budget?.period === "MONTH") {
    params.set("priceMax", String(requirements.budget.amountInr));
  }
  if (requirements.genderPolicyNeeded && requirements.genderPolicyNeeded !== "ANY") {
    params.set("genderPolicy", requirements.genderPolicyNeeded);
  }
  if (requirements.accommodation.foodIncluded === "REQUIRED") {
    params.set("foodIncluded", "true");
  }
  if (requirements.accommodation.ac === "REQUIRED") {
    params.set("ac", "true");
  }
  if (requirements.accommodation.privateBath != null) {
    params.set("privateBath", String(requirements.accommodation.privateBath));
  }
  if (requirements.accommodation.occupancy !== "ANY") {
    params.set("occupancy", requirements.accommodation.occupancy);
  }
  if (requirements.accommodation.kinds.length > 0) {
    params.set("kinds", requirements.accommodation.kinds.join(","));
  }
  if (requirements.transport.maxCommuteMin != null) {
    params.set("maxCommuteMin", String(requirements.transport.maxCommuteMin));
  }

  return params;
}
