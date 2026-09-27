import type { FoodSearchItem } from "@livo/schemas";
import { Money } from "./Money.js";
import { ReasonChips } from "./ReasonChips.js";
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

/** Parity with ListingCard, for a food search result. No photo pipeline yet, same neutral placeholder. */
export function FoodListingCard({
  item,
  destinationId,
  destinationName,
}: {
  item: FoodSearchItem;
  destinationId: string;
  destinationName: string;
}) {
  return (
    <li className="flex gap-4 rounded-lg border border-slate-200 p-4">
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-slate-100 text-2xl"
        aria-hidden
      >
        🍱
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-900">{item.name}</div>
            <div className="text-sm text-slate-600">
              {KIND_LABEL[item.kind] ?? item.kind}
              {item.foodPlan.vegOnly ? " · veg only" : ""}
              {item.foodPlan.meals.length > 0 ? ` · ${item.foodPlan.meals.join(", ").toLowerCase()}` : ""}
            </div>
          </div>
          <div className="text-right">
            <Money
              paise={item.foodPlan.pricePaise}
              suffix={BASIS_SUFFIX[item.foodPlan.priceBasis] ?? ""}
              className="font-semibold"
            />
          </div>
        </div>

        <div className="text-sm text-slate-600">{(item.distanceM / 1000).toFixed(1)} km away</div>

        <ReasonChips reasons={item.reasons} />

        <form action={addFoodToNewPlan}>
          <input type="hidden" name="destinationId" value={destinationId} />
          <input type="hidden" name="destinationName" value={destinationName} />
          <input type="hidden" name="foodPlanId" value={item.foodPlan.id} />
          <button
            type="submit"
            className="mt-1 rounded-md border border-teal-700 px-3 py-1 text-sm font-medium text-teal-800 hover:bg-teal-50"
          >
            Add to plan
          </button>
        </form>
      </div>
    </li>
  );
}
