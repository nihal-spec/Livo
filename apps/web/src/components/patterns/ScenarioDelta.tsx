import Link from "next/link";
import { Money } from "./Money.js";

export interface ScenarioDeltaProps {
  lever: string;
  found: boolean;
  note: string;
  alternative: { placeId: string; placeSlug: string; placeName: string } | null;
  deltaMonthlyPaise: bigint;
  deltaUpfrontPaise: bigint;
}

const LEVER_LABEL: Record<string, string> = {
  CHEAPER: "Cheaper",
  CLOSER: "Closer",
  FOOD_INCLUDED: "Food included",
  PRIVATE_ROOM: "Private room",
};

function Delta({ paise, label }: { paise: bigint; label: string }) {
  const sign = paise > 0n ? "+" : paise < 0n ? "−" : "";
  const tone = paise > 0n ? "text-red-700" : paise < 0n ? "text-emerald-700" : "text-slate-600";
  const abs = paise < 0n ? -paise : paise;
  return (
    <span className={tone}>
      {sign}
      <Money paise={abs} /> {label}
    </span>
  );
}

/**
 * UX_UI_SPEC.md §5.15: a scenario card showing the lever tried, the
 * alternative found (or an honest "none found"), and the delta in plain
 * words and numbers — never a bare score.
 */
export function ScenarioDelta({ lever, found, note, alternative, deltaMonthlyPaise, deltaUpfrontPaise }: ScenarioDeltaProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-900">{LEVER_LABEL[lever] ?? lever}</p>
      <p className="mt-1 text-sm text-slate-600">{note}</p>

      {found && alternative && (
        <div className="mt-2 space-y-1 text-sm">
          <Link href={`/p/${alternative.placeSlug}`} className="font-medium text-brand-700 hover:underline">
            {alternative.placeName}
          </Link>
          <div className="flex gap-4">
            <Delta paise={deltaMonthlyPaise} label="/mo" />
            <Delta paise={deltaUpfrontPaise} label="upfront" />
          </div>
        </div>
      )}
    </div>
  );
}
