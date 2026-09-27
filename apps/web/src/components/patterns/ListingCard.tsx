import Link from "next/link";
import type { AccommodationSearchItem } from "@livo/schemas";
import { Money } from "./Money.js";
import { CommuteBadge } from "./CommuteBadge.js";
import { ReasonChips } from "./ReasonChips.js";
import { CompareToggle } from "./CompareToggle.js";
import { addAccommodationToNewPlan } from "@/app/actions/plans.js";

const BASIS_SUFFIX: Record<string, string> = {
  PER_MONTH: "/mo",
  PER_NIGHT: "/night",
  PER_WEEK: "/week",
  PER_DAY: "/day",
  PER_MEAL: "/meal",
};

/**
 * UX_UI_SPEC.md §2/§5.6: photo, name, kind, room line, price+basis, monthly
 * total, commute, reason chips. No stock photography — a neutral
 * placeholder when there is no real photo (there is no photo pipeline yet).
 */
export function ListingCard({
  item,
  destinationId,
  destinationName,
}: {
  item: AccommodationSearchItem;
  destinationId: string;
  destinationName: string;
}) {
  return (
    <li className="flex gap-4 rounded-lg border border-slate-200 p-4">
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-2xl"
        aria-hidden
      >
        🏠
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link href={`/p/${item.slug}`} className="font-semibold text-slate-900 hover:underline">
              {item.name}
            </Link>
            <div className="text-sm text-slate-500">
              {item.kind} · {item.room.occupancy.toLowerCase()} · {item.room.ac ? "AC" : "Non-AC"}
              {item.room.privateBath ? " · private bath" : ""}
            </div>
          </div>
          <div className="text-right">
            <Money paise={item.room.pricePaise} suffix={BASIS_SUFFIX[item.room.priceBasis] ?? ""} className="font-semibold" />
            {item.room.depositPaise != null && (
              <div className="text-xs text-slate-500">
                +<Money paise={item.room.depositPaise} /> deposit
              </div>
            )}
          </div>
        </div>

        {item.commute && <CommuteBadge commute={item.commute} />}

        {item.monthlyTotalPaise != null && (
          <div className="text-sm text-slate-700">
            Your monthly total: <Money paise={item.monthlyTotalPaise} className="font-medium" />
          </div>
        )}

        <ReasonChips reasons={item.reasons} />

        <div className="flex items-center gap-3">
          <form action={addAccommodationToNewPlan}>
            <input type="hidden" name="destinationId" value={destinationId} />
            <input type="hidden" name="destinationName" value={destinationName} />
            <input type="hidden" name="roomOptionId" value={item.room.id} />
            <button
              type="submit"
              className="mt-1 rounded-md border border-teal-700 px-3 py-1 text-sm font-medium text-teal-800 hover:bg-teal-50"
            >
              Add to plan
            </button>
          </form>
          <CompareToggle compareId={`${item.placeId}.${item.room.id}`} />
        </div>
      </div>
    </li>
  );
}
