import { z } from "zod";
import { BudgetCategory, Frequency, SourceType, TravelMode } from "./enums.js";
import { paiseSchema } from "./money.js";

/**
 * Contracts for the budget engine (ARCHITECTURE.md §5). The engine itself
 * (packages/budget-engine) is pure and framework-free; these are the shared
 * types so the API, the client-side recompute and the AI tool layer agree.
 */

export const LineItemProvenance = z.object({
  sourceType: SourceType,
  ref: z.string(),
  observedAt: z.string().datetime().optional(),
  stale: z.boolean().default(false),
});
export type LineItemProvenance = z.infer<typeof LineItemProvenance>;

export const LineItemInput = z.object({
  id: z.string(),
  category: BudgetCategory,
  label: z.string(),
  amountPaise: paiseSchema,
  frequency: Frequency,
  quantityPerFrequency: z.number().positive().default(1),
  kind: z.enum(["FIXED", "VARIABLE"]),
  refundable: z.boolean().default(false),
  provenance: LineItemProvenance,
});
export type LineItemInput = z.infer<typeof LineItemInput>;

export const BudgetInput = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  people: z.number().int().min(1).max(20).default(1),
  monthlyIncomePaise: paiseSchema.nullable().optional(),
  cashOnHandPaise: paiseSchema.nullable().optional(),
  bufferPercent: z.number().min(0).max(100).default(10),
  lineItems: z.array(LineItemInput),
  /** Rent basis + whether it's a monthly-priced place, used for the min-charge flag. */
  accommodation: z
    .object({
      priceBasis: z.enum(["PER_NIGHT", "PER_WEEK", "PER_MONTH", "PER_DAY"]),
      hasPerDayRate: z.boolean().default(false),
    })
    .nullable()
    .optional(),
  commute: z
    .object({
      mode: TravelMode,
      tripsPerWeek: z.number().int().min(0).max(21).default(5),
      fareMinPaise: paiseSchema,
      fareMaxPaise: paiseSchema,
    })
    .nullable()
    .optional(),
});
export type BudgetInput = z.infer<typeof BudgetInput>;

export const AffordabilityFlag = z.enum([
  "NEGATIVE_REMAINING_INCOME",
  "UPFRONT_EXCEEDS_CASH",
  "MONTHLY_MIN_CHARGE",
  "OVER_BUDGET_CAP",
]);
export type AffordabilityFlag = z.infer<typeof AffordabilityFlag>;

export const BudgetResult = z.object({
  days: z.number().int(),
  months: z.number(),
  setupPaise: paiseSchema,
  refundablePaise: paiseSchema,
  recurring: z.object({
    dailyPaise: paiseSchema,
    weeklyPaise: paiseSchema,
    monthlyPaise: paiseSchema,
  }),
  tripTotalPaise: paiseSchema,
  perPersonTotalPaise: paiseSchema,
  byCategory: z.record(BudgetCategory, paiseSchema),
  affordability: z
    .object({
      monthlyIncomePaise: paiseSchema,
      remainingMonthlyPaise: paiseSchema,
      upfrontShortfallPaise: paiseSchema,
      bufferPaise: paiseSchema,
      flags: z.array(AffordabilityFlag),
    })
    .nullable(),
  confidence: z.object({
    level: z.enum(["HIGH", "MEDIUM", "LOW"]),
    estimatedLines: z.number().int(),
    staleLines: z.number().int(),
  }),
  engineVersion: z.string(),
  assumptionsVersion: z.string(),
});
export type BudgetResult = z.infer<typeof BudgetResult>;

/** What-if levers (ARCHITECTURE.md §6). */
export const ScenarioLever = z.enum([
  "CHEAPER",
  "CLOSER",
  "FOOD_INCLUDED",
  "PUBLIC_TRANSPORT",
  "PRIVATE_ROOM",
]);
export type ScenarioLever = z.infer<typeof ScenarioLever>;

export const ScenarioOverrides = z.object({
  budgetCapInr: z.number().int().positive().nullable().optional(),
  endDate: z.string().date().nullable().optional(),
  durationDays: z.number().int().min(1).max(400).nullable().optional(),
  occupancy: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORM_4PLUS", "WHOLE_UNIT"]).nullable().optional(),
  foodIncluded: z.boolean().nullable().optional(),
  commuteMode: TravelMode.nullable().optional(),
  maxCommuteMin: z.number().int().min(5).max(180).nullable().optional(),
  swapRoomOptionId: z.string().nullable().optional(),
  lever: ScenarioLever.nullable().optional(),
});
export type ScenarioOverrides = z.infer<typeof ScenarioOverrides>;
