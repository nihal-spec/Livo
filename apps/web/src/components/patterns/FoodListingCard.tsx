import { MapPin, Plus, Truck } from "lucide-react";
import type { FoodSearchItem } from "@livo/schemas";
import { Badge, buttonClass } from "@/components/ui/index.js";
import { Money } from "./Money.js";
import { ReasonChips } from "./ReasonChips.js";
import { PlaceVisual } from "./PlaceVisual.js";
import { addFoodToNewPlan } from "@/app/actions/plans.js";

const BASIS_SUFFIX: Record<string, string> = {
  PER_MONTH: "/mo",
  PER_WEEK: "/week",
  PER_DAY: "/day",
  PER_MEAL: "/meal",
};

const KIND_LABEL: Record<string, string> = {
  MESS: "Mess",
  TIFFIN: "Tiffin service",
  RESTAURANT: "Restaurant",
  CLOUD_KITCHEN: "Cloud kitchen",
  MEAL_SUBSCRIPTION: "Meal subscription",
  GROCERY: "Grocery",
};

/** Parity with ListingCard, for a food search result. */
export function FoodListingCard({
  item,
  destinationId,
  destinationName,
  planId,
}: {
  item: FoodSearchItem;
  destinationId: string;
  destinationName: string;
  planId?: string;
}) {
  return (
    <li
      id={item.foodPlan.id}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card transition-shadow hover:shadow-lift sm:flex-row"
    >
      <div className="relative sm:w-44 sm:shrink-0">
        <PlaceVisual id={item.placeId} kind={item.kind} className="h-32 w-full sm:h-full" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge className="bg-white/95 text-ink shadow-sm">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
          {item.isSample && <Badge tone="violet" className="bg-violet-50/95">Sample listing</Badge>}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="line-clamp-1 text-base font-semibold text-ink">{item.name}</div>
            <p className="mt-0.5 text-sm text-slate-600">
              {item.foodPlan.vegOnly ? "Veg only · " : ""}
              {item.foodPlan.meals.length > 0 ? item.foodPlan.meals.join(", ").toLowerCase() : "Meals"}
            </p>
          </div>
          <Money
            paise={item.foodPlan.pricePaise}
            suffix={BASIS_SUFFIX[item.foodPlan.priceBasis] ?? ""}
            className="shrink-0 text-lg font-bold text-ink"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-slate-500" aria-hidden />
            {(item.distanceM / 1000).toFixed(1)} km away
          </span>
          {item.foodPlan.delivers && (
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-slate-500" aria-hidden />
              Home delivery
            </span>
          )}
        </div>

        <ReasonChips reasons={item.reasons} />

        <div className="mt-auto flex justify-end border-t border-slate-100 pt-3">
          <form action={addFoodToNewPlan}>
            <input type="hidden" name="destinationId" value={destinationId} />
            <input type="hidden" name="destinationName" value={destinationName} />
            <input type="hidden" name="foodPlanId" value={item.foodPlan.id} />
            {planId && <input type="hidden" name="planId" value={planId} />}
            <button type="submit" className={buttonClass("primary", "sm")}>
              <Plus className="h-4 w-4" aria-hidden />
              Add to plan
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
