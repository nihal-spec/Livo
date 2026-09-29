import Link from "next/link";
import { Plus } from "lucide-react";
import type { AccommodationSearchItem } from "@livo/schemas";
import { Badge, buttonClass } from "@/components/ui/index.js";
import { Money } from "./Money.js";
import { CommuteBadge } from "./CommuteBadge.js";
import { ReasonChips } from "./ReasonChips.js";
import { CompareToggle } from "./CompareToggle.js";
import { PlaceVisual } from "./PlaceVisual.js";
import { addAccommodationToNewPlan } from "@/app/actions/plans.js";

const BASIS_SUFFIX: Record<string, string> = {
  PER_MONTH: "/mo",
  PER_NIGHT: "/night",
  PER_WEEK: "/week",
  PER_DAY: "/day",
  PER_MEAL: "/meal",
};

const KIND_LABEL: Record<string, string> = {
  PG: "PG",
  HOSTEL: "Hostel",
  COLIVING: "Co-living",
  ROOM_RENTAL: "Room",
  LODGE: "Lodge",
  HOTEL: "Hotel",
  SERVICE_APARTMENT: "Service apartment",
  DORMITORY: "Dormitory",
};

const OCCUPANCY_LABEL: Record<string, string> = {
  SINGLE: "Single room",
  DOUBLE: "Double sharing",
  TRIPLE: "Triple sharing",
  DORM_4PLUS: "Dorm (4+)",
  WHOLE_UNIT: "Whole unit",
};

/**
 * UX_UI_SPEC.md §2/§5.6: visual, name, kind, room line, price+basis,
 * monthly total, commute, reason chips. Inside the plan wizard (planId
 * set) "Add to plan" fills the plan's stay; otherwise it starts a plan.
 */
export function ListingCard({
  item,
  destinationId,
  destinationName,
  planId,
}: {
  item: AccommodationSearchItem;
  destinationId: string;
  destinationName: string;
  planId?: string;
}) {
  const detailHref = `/p/${item.slug}${planId ? `?planId=${planId}` : ""}`;
  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition-shadow hover:shadow-lift sm:flex-row">
      <Link href={detailHref} className="relative block sm:w-52 sm:shrink-0" tabIndex={-1}>
        <PlaceVisual id={item.placeId} kind={item.kind} className="h-36 w-full sm:h-full" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge className="bg-white/95 text-ink shadow-sm">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
          {item.isSample && <Badge tone="violet" className="bg-violet-50/95">Sample listing</Badge>}
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={detailHref} className="line-clamp-1 text-base font-semibold text-ink hover:underline">
              {item.name}
            </Link>
            <p className="mt-0.5 text-sm text-slate-600">
              {OCCUPANCY_LABEL[item.room.occupancy] ?? item.room.occupancy} · {item.room.ac ? "AC" : "Non-AC"}
              {item.room.privateBath ? " · Private bath" : ""}
              {item.foodIncluded ? " · Meals included" : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Money
              paise={item.room.pricePaise}
              suffix={BASIS_SUFFIX[item.room.priceBasis] ?? ""}
              className="text-lg font-bold text-ink"
            />
            {item.room.depositPaise != null && (
              <div className="text-xs text-slate-600">
                + <Money paise={item.room.depositPaise} /> deposit
              </div>
            )}
          </div>
        </div>

        {item.commute && <CommuteBadge commute={item.commute} />}

        <ReasonChips reasons={item.reasons} />

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          {item.monthlyTotalPaise != null ? (
            <div className="text-sm text-slate-600">
              All-in monthly{" "}
              <Money paise={item.monthlyTotalPaise} className="font-semibold text-ink" />
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <CompareToggle compareId={`${item.placeId}.${item.room.id}`} />
            <form action={addAccommodationToNewPlan}>
              <input type="hidden" name="destinationId" value={destinationId} />
              <input type="hidden" name="destinationName" value={destinationName} />
              <input type="hidden" name="roomOptionId" value={item.room.id} />
              {planId && <input type="hidden" name="planId" value={planId} />}
              <button type="submit" className={buttonClass("primary", "sm")}>
                <Plus className="h-4 w-4" aria-hidden />
                Add to plan
              </button>
            </form>
          </div>
        </div>
      </div>
    </li>
  );
}
