import { formatPaise } from "@livo/schemas";
import type { ReasonCode } from "@livo/schemas";

const REASON_TEXT: Record<string, (value?: string) => string> = {
  FOOD_INCLUDED: () => "Food included",
  CHEAPER_THAN_MEDIAN: (v) => (v ? `${formatPaise(BigInt(v))}/mo cheaper than median` : "Cheaper than median"),
  CLOSEST_MATCH: () => "Closest match",
  VERIFIED_RECENTLY: () => "Verified recently",
  PRIVATE_ROOM: () => "Private room",
  WITHIN_WALK: () => "Walkable",
  VEG_ONLY: () => "Veg only",
  DELIVERS: () => "Delivers",
};

/**
 * UX_UI_SPEC.md §5.6 / ADR-014: explicit, rule-derived reasons — never an
 * opaque score. Each chip's text is generated here from the reason code the
 * search service returned, not free text from the model or the database.
 * Shared by accommodation and food search results (same ReasonCode enum).
 */
export function ReasonChips({ reasons }: { reasons: Array<{ code: ReasonCode; value?: string }> }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reasons.map((r, i) => (
        <li
          key={`${r.code}-${i}`}
          className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-200"
        >
          {(REASON_TEXT[r.code] ?? (() => r.code))(r.value)}
        </li>
      ))}
    </ul>
  );
}
