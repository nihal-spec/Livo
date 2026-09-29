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
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card">
      <div className="bg-gradient-to-br from-brand-700 to-brand-900 p-5 text-white">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-100">Budget</h2>
        <p className="mt-2 text-sm text-brand-100">Recurring per month</p>
        <Money paise={result.recurring.monthlyPaise} className="text-3xl font-bold tracking-tight" />
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-4 text-sm">
          <div>
            <p className="text-brand-100">Setup (upfront, incl. deposit)</p>
            <Money paise={result.setupPaise} className="text-base font-semibold" />
          </div>
          <div>
            <p className="text-brand-100">Trip total ({result.days} days)</p>
            <Money paise={result.tripTotalPaise} className="text-base font-semibold" />
          </div>
        </div>
      </div>

      <div className="p-5">
        <dl className="space-y-2.5 text-sm">
          {categoryEntries.map(([category, amount]) => (
            <div key={category} className="flex justify-between gap-3">
              <dt className="text-slate-600">{CATEGORY_LABEL[category]}</dt>
              <dd className="font-medium text-ink">
                <Money paise={amount} />
              </dd>
            </div>
          ))}
        </dl>

        {result.affordability && (
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Left from income each month</span>
              <Money
                paise={result.affordability.remainingMonthlyPaise}
                className={
                  result.affordability.remainingMonthlyPaise < 0n ? "font-semibold text-red-700" : "font-semibold text-brand-700"
                }
              />
            </div>
            {result.affordability.upfrontShortfallPaise > 0n && (
              <div className="flex justify-between text-amber-800">
                <span>Upfront shortfall</span>
                <Money paise={result.affordability.upfrontShortfallPaise} className="font-semibold" />
              </div>
            )}
          </div>
        )}

        {result.affordability?.flags && result.affordability.flags.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-xl bg-amber-50 p-3">
            {result.affordability.flags.map((flag) => (
              <li key={flag} className="flex gap-1.5 text-xs text-amber-900">
                <span aria-hidden>⚠</span>
                {FLAG_TEXT[flag] ?? flag}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-xs text-slate-600">
          Confidence: {result.confidence.level.toLowerCase()}
          {result.confidence.estimatedLines > 0 ? ` · ${result.confidence.estimatedLines} estimated line(s)` : ""}
        </p>
      </div>
    </div>
  );
}
