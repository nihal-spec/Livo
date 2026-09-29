import { Bike, Bus, Car, Footprints, Ship, TrainFront } from "lucide-react";
import type { AccommodationSearchItem } from "@livo/schemas";

const MODE_ICON = {
  WALK: Footprints,
  TWO_WHEELER: Bike,
  CAR: Car,
  AUTO: Car,
  CAB: Car,
  BUS: Bus,
  METRO: TrainFront,
  WATER_METRO: Ship,
  MIXED_TRANSIT: Bus,
} as const;

const MODE_LABEL: Record<string, string> = {
  WALK: "walk",
  TWO_WHEELER: "by two-wheeler",
  CAR: "by car",
  AUTO: "by auto",
  CAB: "by cab",
  BUS: "by bus",
  METRO: "by metro",
  WATER_METRO: "by water metro",
  MIXED_TRANSIT: "by transit",
};

function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/**
 * UX_UI_SPEC.md §5.10: always a range, never false precision, and the
 * estimation method is disclosed so "Estimated" data is never presented
 * as if it were measured.
 */
export function CommuteBadge({ commute }: { commute: NonNullable<AccommodationSearchItem["commute"]> }) {
  const Icon = MODE_ICON[commute.mode as keyof typeof MODE_ICON] ?? Footprints;
  const isEstimate = commute.method === "DISTANCE_ESTIMATE";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700" title={isEstimate ? "Estimated from road distance" : undefined}>
      <Icon className="h-4 w-4 text-slate-500" aria-hidden />
      <span className="font-medium text-ink">
        {minutes(commute.durationSMin)}–{minutes(commute.durationSMax)} min
      </span>
      <span className="text-slate-600">
        {MODE_LABEL[commute.mode] ?? ""} · {(commute.distanceM / 1000).toFixed(1)} km
        {isEstimate ? " · est." : ""}
      </span>
    </span>
  );
}
