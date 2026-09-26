import { z } from "zod";
import { GenderPolicy, AccommodationKind, PlanPurpose } from "./enums.js";

/**
 * Structured output of AI intent extraction (AI_ARCHITECTURE.md §4).
 * The AI never bypasses this schema: free text -> TripRequirements -> editable
 * summary UI -> deterministic search. Versioned so stored plans keep working
 * as the schema evolves.
 */
export const TripRequirementsV1 = z.object({
  v: z.literal(1),
  purpose: PlanPurpose.nullable(),
  destinationText: z.string().max(200).nullable(),
  originCity: z.string().max(100).nullable(),
  startDate: z.string().date().nullable(),
  endDate: z.string().date().nullable(),
  durationDays: z.number().int().min(1).max(400).nullable(),
  people: z.number().int().min(1).max(20).default(1),
  genderPolicyNeeded: GenderPolicy.nullable(),
  monthlyIncomeInr: z.number().int().min(0).max(10_000_000).nullable(),
  budget: z
    .object({
      amountInr: z.number().int().min(0),
      period: z.enum(["MONTH", "TRIP", "DAY"]),
    })
    .nullable(),
  cashOnHandInr: z.number().int().min(0).nullable(),
  accommodation: z.object({
    kinds: z.array(AccommodationKind).default([]),
    occupancy: z.enum(["SINGLE", "SHARED", "ANY"]).default("ANY"),
    ac: z.enum(["REQUIRED", "PREFERRED", "NO"]).nullable(),
    privateBath: z.boolean().nullable(),
    foodIncluded: z.enum(["REQUIRED", "PREFERRED", "NO"]).nullable(),
  }),
  food: z.object({
    diet: z.enum(["VEG", "NON_VEG", "ANY"]).default("ANY"),
    mealsPerDay: z.number().int().min(0).max(4).nullable(),
  }),
  transport: z.object({
    hasVehicle: z.enum(["NONE", "TWO_WHEELER", "CAR"]).nullable(),
    preferredModes: z.array(z.enum(["WALK", "BUS", "METRO", "AUTO", "CAB", "OWN"])).default([]),
    maxCommuteMin: z.number().int().min(5).max(180).nullable(),
  }),
  constraints: z.array(z.string().max(120)).max(10).default([]),
  missing: z.array(z.string()).default([]),
  confidence: z.record(z.string(), z.enum(["HIGH", "MEDIUM", "LOW"])).default({}),
});
export type TripRequirementsV1 = z.infer<typeof TripRequirementsV1>;

export const TripRequirements = TripRequirementsV1;
export type TripRequirements = TripRequirementsV1;

export function emptyTripRequirements(): TripRequirements {
  return TripRequirementsV1.parse({
    v: 1,
    purpose: null,
    destinationText: null,
    originCity: null,
    startDate: null,
    endDate: null,
    durationDays: null,
    genderPolicyNeeded: null,
    monthlyIncomeInr: null,
    budget: null,
    cashOnHandInr: null,
    accommodation: { ac: null, privateBath: null, foodIncluded: null },
    food: {},
    transport: { hasVehicle: null, maxCommuteMin: null },
  });
}
