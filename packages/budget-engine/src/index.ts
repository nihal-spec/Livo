import type {
  AffordabilityFlag,
  BudgetCategory,
  BudgetInput,
  BudgetResult,
  Frequency,
  LineItemInput,
} from "@livo/schemas";

/**
 * Deterministic budget engine. Pure TypeScript, no framework/DB deps —
 * runs identically on the server and in the browser for instant what-if
 * recompute (ARCHITECTURE.md §5). AI never touches this; it only reads
 * BudgetResult to explain it.
 *
 * Money: all amounts are integer paise (bigint). Rounding: each line is
 * rounded half-up after proration; totals are sums of already-rounded
 * lines, so the displayed total always equals the sum of displayed lines.
 */

export const ENGINE_VERSION = "1.0.0";

const DAY_MS = 86_400_000;
const ALL_BUDGET_CATEGORIES: BudgetCategory[] = [
  "ACCOMMODATION",
  "DEPOSIT",
  "FOOD",
  "TRANSPORT",
  "ACTIVITIES",
  "LAUNDRY",
  "GROCERIES",
  "MOBILE_DATA",
  "ESSENTIALS",
  "MEDICAL_LOGISTICS",
  "MISC",
  "EMERGENCY_BUFFER",
];

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const diff = Math.round((end - start) / DAY_MS);
  return Math.max(1, diff);
}

function roundHalfUp(paise: bigint, factor: number): bigint {
  if (factor === 1) return paise;
  // Work in a wider precision to avoid float error on typical rupee amounts.
  const scaled = Number(paise) * factor;
  return BigInt(Math.round(scaled));
}

/** Proration factor for a line item's frequency over the stay. */
function prorationFactor(
  item: LineItemInput,
  days: number,
  accommodation: BudgetInput["accommodation"],
): number {
  switch (item.frequency as Frequency) {
    case "ONE_TIME":
      return 1;
    case "DAILY":
      return days;
    case "PER_NIGHT":
      return days;
    case "WEEKLY":
      return days / 7;
    case "PER_MEAL":
      // quantityPerFrequency already encodes meals/day; treat as a daily rate.
      return days;
    case "MONTHLY": {
      const rawMonths = days / 30;
      const isMinChargeAccommodation =
        item.category === "ACCOMMODATION" &&
        accommodation?.priceBasis === "PER_MONTH" &&
        !accommodation.hasPerDayRate;
      // A monthly-priced PG charges the full month even for a shorter stay,
      // unless it also offers a per-day rate (ARCHITECTURE.md §5).
      return isMinChargeAccommodation ? Math.max(rawMonths, 1) : rawMonths;
    }
    default:
      return 1;
  }
}

interface ComputedLine {
  item: LineItemInput;
  totalPaise: bigint;
  isMinCharge: boolean;
}

function computeLines(input: BudgetInput, days: number): ComputedLine[] {
  return input.lineItems.map((item) => {
    const factor = prorationFactor(item, days, input.accommodation ?? null);
    const base = item.amountPaise * BigInt(Math.round(item.quantityPerFrequency * 1000)) / 1000n;
    const totalPaise = roundHalfUp(base, factor);
    const isMinCharge =
      item.frequency === "MONTHLY" &&
      item.category === "ACCOMMODATION" &&
      input.accommodation?.priceBasis === "PER_MONTH" &&
      !input.accommodation.hasPerDayRate &&
      days < 30;
    return { item, totalPaise, isMinCharge };
  });
}

export function calculateBudget(
  input: BudgetInput,
  opts: { assumptionsVersion?: string } = {},
): BudgetResult {
  const days = daysBetween(input.startDate, input.endDate);
  const months = days / 30;
  const lines = computeLines(input, days);

  let setupPaise = 0n;
  let refundablePaise = 0n;
  let recurringTotalPaise = 0n;
  let minChargeHit = false;
  const byCategory: Record<string, bigint> = Object.fromEntries(
    ALL_BUDGET_CATEGORIES.map((c) => [c, 0n]),
  );

  for (const line of lines) {
    byCategory[line.item.category] = (byCategory[line.item.category] ?? 0n) + line.totalPaise;
    if (line.item.frequency === "ONE_TIME") {
      setupPaise += line.totalPaise;
      if (line.item.refundable) refundablePaise += line.totalPaise;
    } else {
      recurringTotalPaise += line.totalPaise;
    }
    if (line.isMinCharge) minChargeHit = true;
  }

  // Emergency buffer: a percentage of monthly recurring, shown as its own
  // line so it is never silently hidden inside the totals.
  const recurringDailyEquivalent = days > 0 ? Number(recurringTotalPaise) / days : 0;
  const recurringMonthlyPaise = BigInt(Math.round(recurringDailyEquivalent * 30));
  const recurringWeeklyPaise = BigInt(Math.round(recurringDailyEquivalent * 7));
  const recurringDailyPaise = BigInt(Math.round(recurringDailyEquivalent));

  const bufferPaise = BigInt(Math.round(Number(recurringMonthlyPaise) * (input.bufferPercent / 100)));
  byCategory.EMERGENCY_BUFFER = (byCategory.EMERGENCY_BUFFER ?? 0n) + bufferPaise;

  const tripTotalPaise = setupPaise + recurringTotalPaise + bufferPaise;
  const perPersonTotalPaise = tripTotalPaise / BigInt(Math.max(1, input.people));

  const flags: AffordabilityFlag[] = [];
  if (minChargeHit) flags.push("MONTHLY_MIN_CHARGE");

  let affordability: BudgetResult["affordability"] = null;
  if (input.monthlyIncomePaise != null) {
    const monthlyIncomePaise = input.monthlyIncomePaise;
    const remainingMonthlyPaise = monthlyIncomePaise - recurringMonthlyPaise - bufferPaise;
    if (remainingMonthlyPaise < 0n) flags.push("NEGATIVE_REMAINING_INCOME");

    const cash = input.cashOnHandPaise ?? 0n;
    const upfrontShortfallPaise = setupPaise > cash ? setupPaise - cash : 0n;
    if (upfrontShortfallPaise > 0n) flags.push("UPFRONT_EXCEEDS_CASH");

    affordability = {
      monthlyIncomePaise,
      remainingMonthlyPaise,
      upfrontShortfallPaise,
      bufferPaise,
      flags: [...flags],
    };
  }

  const estimatedLines = input.lineItems.filter((l) => l.provenance.sourceType === "ESTIMATED").length;
  const staleLines = input.lineItems.filter((l) => l.provenance.stale).length;
  const confidenceLevel =
    estimatedLines === 0 && staleLines === 0
      ? "HIGH"
      : estimatedLines >= 3 || staleLines >= 2
        ? "LOW"
        : "MEDIUM";

  return {
    days,
    months,
    setupPaise,
    refundablePaise,
    recurring: {
      dailyPaise: recurringDailyPaise,
      weeklyPaise: recurringWeeklyPaise,
      monthlyPaise: recurringMonthlyPaise,
    },
    tripTotalPaise,
    perPersonTotalPaise,
    byCategory: byCategory as BudgetResult["byCategory"],
    affordability,
    confidence: { level: confidenceLevel, estimatedLines, staleLines },
    engineVersion: ENGINE_VERSION,
    assumptionsVersion: opts.assumptionsVersion ?? "unversioned",
  };
}

export { daysBetween };
