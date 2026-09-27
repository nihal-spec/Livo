import type { AccommodationSearchItem } from "@livo/schemas";

const MODE_ICON: Record<string, string> = {
  WALK: "\u{1F6B6}",
  TWO_WHEELER: "\u{1F6F5}",
  CAR: "\u{1F697}",
  AUTO: "\u{1F6FA}",
  CAB: "\u{1F695}",
  BUS: "\u{1F68C}",
  METRO: "\u{1F686}",
  WATER_METRO: "⛴",
  MIXED_TRANSIT: "\u{1F6B6}",
};

function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

/**
 * UX_UI_SPEC.md §5.10: always a range, never false precision, and the
 * estimation method is disclosed (here via the label under the range) so
 * "Estimated" data is never presented as if it were measured.
 */
export function CommuteBadge({ commute }: { commute: NonNullable<AccommodationSearchItem["commute"]> }) {
  const isEstimate = commute.method === "DISTANCE_ESTIMATE";
  return (
    <span className="inline-flex flex-col text-sm">
      <span className="inline-flex items-center gap-1">
        <span aria-hidden>{MODE_ICON[commute.mode] ?? "\u{1F6B6}"}</span>
        <span className="font-medium text-slate-900">
          {minutes(commute.durationSMin)}
          {"–"}
          {minutes(commute.durationSMax)} min
        </span>
        <span className="text-slate-600">
          {"·"} {(commute.distanceM / 1000).toFixed(1)} km
        </span>
      </span>
      {isEstimate && <span className="text-xs text-slate-600">Estimated from road distance</span>}
    </span>
  );
}
