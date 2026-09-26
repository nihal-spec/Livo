import type { TravelMode } from "@livo/schemas";

/**
 * Distance-based commute fallback, used whenever there is no precomputed
 * `TravelEstimate` row (no OSRM/Valhalla deployment yet — ARCHITECTURE.md
 * ADR-010, and the "No transport route / OSRM failure" edge case in
 * MASTER_PLAN.md §43: "Distance-based estimate with wide range; label").
 * Never presented as anything but an estimate.
 */

export interface DistanceEstimate {
  mode: TravelMode;
  durationSMin: number;
  durationSMax: number;
  method: "DISTANCE_ESTIMATE";
}

const WALK_SPEED_KMH = 4.5;
const AUTO_SPEED_KMH = 18; // conservative urban average, includes stops
const BUS_SPEED_KMH = 15; // includes waiting/walking to stop, folded into range width

function hoursForKm(km: number, speedKmh: number): number {
  return km / speedKmh;
}

/**
 * Picks a sensible default mode by distance and returns a wide [min,max]
 * duration range rather than a false-precision single number.
 */
export function estimateByDistance(distanceM: number, preferredMode?: TravelMode | "ANY"): DistanceEstimate {
  const km = distanceM / 1000;

  let mode: TravelMode;
  if (preferredMode && preferredMode !== "ANY") {
    mode = preferredMode;
  } else if (km <= 2) {
    mode = "WALK";
  } else if (km <= 8) {
    mode = "BUS";
  } else {
    mode = "AUTO";
  }

  const speed = mode === "WALK" ? WALK_SPEED_KMH : mode === "BUS" || mode === "METRO" ? BUS_SPEED_KMH : AUTO_SPEED_KMH;
  const hours = hoursForKm(km, speed);
  const baseSeconds = hours * 3600;

  // Wide, honest range: -20%/+40% plus a fixed wait/walk buffer for anything
  // that isn't a straight walk.
  const buffer = mode === "WALK" ? 0 : 300; // 5 min for waiting/last-mile walk
  return {
    mode,
    durationSMin: Math.round(baseSeconds * 0.8) + buffer,
    durationSMax: Math.round(baseSeconds * 1.4) + buffer * 2,
    method: "DISTANCE_ESTIMATE",
  };
}
