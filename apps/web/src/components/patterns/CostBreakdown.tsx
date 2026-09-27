import type { BudgetCategory, BudgetResult } from "@livo/schemas";
import { Money } from "./Money.js";

const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  ACCOMMODATION: "Accommodation",
  DEPOSIT: "Deposit (refundable)",
  FOOD: "Food",
  TRANSPORT: "Transport",
  ACTIVITIES: "Activities",
  LAUNDRY: "Laundry",
  GROCERIES: "Groceries",
  MOBILE_DATA: "Mobile & data",
  ESSENTIALS: "Essentials",
  MEDICAL_LOGISTICS: "Medical logistics",
  MISC: "Miscellaneous",
  EMERGENCY_BUFFER: "Emergency buffer",
};

const FLAG_TEXT: Record<string, string> = {
  NEGATIVE_REMAINING_INCOME: "Your monthly costs exceed your stated income.",
  UPFRONT_EXCEEDS_CASH: "The upfront amount is more than the cash you said you have on hand.",
  MONTHLY_MIN_CHARGE: "This stay is shorter than a month but the room is priced monthly — the full month is charged.",
  OVER_BUDGET_CAP: "This plan is over the budget you set.",
};

/**
 * UX_UI_SPEC.md §5.14. Every figure comes straight from the deterministic
 * budget engine (ARCHITECTURE.md §5) — this component only formats it,
 * it never computes anything itself.
 */
export function CostBreakdown({ result }: { result: BudgetResult }) {
  const categoryEntries = Object.entries(result.byCategory).filter(([, v]) => v > 0n) as Array<
    [BudgetCategory, bigint]
  >;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Budget</h2>

      <dl className="mt-3 space-y-1 text-sm">
        {categoryEntries.map(([category, amount]) => (
          <div key={category} className="flex justify-between">
            <dt className="text-slate-600">{CATEGORY_LABEL[category]}</dt>
            <dd className="font-medium text-slate-900">
              <Money paise={amount} />
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Setup (upfront, incl. deposit)</span>
          <span className="font-medium">
            <Money paise={result.setupPaise} />
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Recurring per month</span>
          <span className="font-medium">
            <Money paise={result.recurring.monthlyPaise} />
          </span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Trip total ({result.days} days)</span>
          <span>
            <Money paise={result.tripTotalPaise} />
          </span>
        </div>
      </div>

      {result.affordability && (
        <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Remaining income per month</span>
            <span className="font-medium">
              <Money paise={result.affordability.remainingMonthlyPaise} />
            </span>
          </div>
          {result.affordability.upfrontShortfallPaise > 0n && (
            <div className="flex justify-between text-amber-800">
              <span>Upfront shortfall</span>
              <span className="font-medium">
                <Money paise={result.affordability.upfrontShortfallPaise} />
              </span>
            </div>
          )}
        </div>
      )}

      {result.affordability?.flags && result.affordability.flags.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3">
          {result.affordability.flags.map((flag) => (
            <li key={flag} className="flex gap-1.5 text-xs text-amber-800">
              <span aria-hidden>{"⚠"}</span>
              {FLAG_TEXT[flag] ?? flag}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-slate-600">
        Confidence: {result.confidence.level.toLowerCase()}
        {result.confidence.estimatedLines > 0 ? ` · ${result.confidence.estimatedLines} estimated line(s)` : ""}
      </p>
    </div>
  );
}
