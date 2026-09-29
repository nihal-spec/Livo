import { z } from "zod";
import { AccommodationKind, FoodKind, GenderPolicy, TravelMode } from "./enums.js";
import { paiseSchema } from "./money.js";

/** GET /search/accommodation query params (API_SPEC.md §2). */
export const AccommodationSearchQuery = z.object({
  destinationId: z.string(),
  checkIn: z.string().date().optional(),
  checkOut: z.string().date().optional(),
  people: z.number().int().min(1).max(20).default(1),
  kinds: z.array(AccommodationKind).default([]),
  occupancy: z.enum(["SINGLE", "SHARED", "ANY"]).default("ANY"),
  genderPolicy: GenderPolicy.default("ANY"),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().positive().optional(),
  ac: z.boolean().optional(),
  privateBath: z.boolean().optional(),
  foodIncluded: z.boolean().optional(),
  amenities: z.array(z.string()).default([]),
  commuteMode: TravelMode.or(z.literal("ANY")).default("ANY"),
  maxCommuteMin: z.number().int().min(5).max(180).optional(),
  radiusKm: z.number().min(0.5).max(30).default(10),
  verifiedOnly: z.boolean().default(false),
  sort: z.enum(["recommended", "price", "total_cost", "closest", "value"]).default("recommended"),
  priority: z.enum(["cheapest", "closest", "balanced"]).default("balanced"),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type AccommodationSearchQuery = z.infer<typeof AccommodationSearchQuery>;

export const ReasonCode = z.enum([
  "FOOD_INCLUDED",
  "CHEAPER_THAN_MEDIAN",
  "CLOSEST_MATCH",
  "VERIFIED_RECENTLY",
  "PRIVATE_ROOM",
  "WITHIN_WALK",
  "VEG_ONLY",
  "DELIVERS",
]);
export type ReasonCode = z.infer<typeof ReasonCode>;

export const AccommodationSearchItem = z.object({
  placeId: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: AccommodationKind,
  location: z.object({ lat: z.number(), lng: z.number() }),
  room: z.object({
    id: z.string(),
    occupancy: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORM_4PLUS", "WHOLE_UNIT"]),
    ac: z.boolean(),
    privateBath: z.boolean(),
    pricePaise: paiseSchema,
    priceBasis: z.enum(["PER_NIGHT", "PER_WEEK", "PER_MONTH", "PER_DAY"]),
    depositPaise: paiseSchema.nullable(),
  }),
  foodIncluded: z.boolean().nullable(),
  commute: z
    .object({
      mode: TravelMode,
      durationSMin: z.number().int(),
      durationSMax: z.number().int(),
      distanceM: z.number().int(),
      fareMinPaise: paiseSchema.nullable(),
      fareMaxPaise: paiseSchema.nullable(),
      method: z.string(),
    })
    .nullable(),
  monthlyTotalPaise: paiseSchema.nullable(),
  reasons: z.array(z.object({ code: ReasonCode, value: z.string().optional() })),
  sponsored: z.boolean().default(false),
  isSample: z.boolean().default(false),
});
export type AccommodationSearchItem = z.infer<typeof AccommodationSearchItem>;

export const AccommodationSearchResponse = z.object({
  destination: z.object({ id: z.string(), name: z.string() }),
  items: z.array(AccommodationSearchItem),
  facets: z.object({
    kinds: z.record(z.string(), z.number().int()),
    counts: z.object({ verified: z.number().int(), total: z.number().int() }),
  }),
  nearMisses: z
    .object({
      cheapestOverBudgetPaise: paiseSchema.nullable(),
      closestOutsideRadiusM: z.number().nullable(),
      relaxations: z.array(z.object({ filter: z.string(), wouldAdd: z.number().int() })),
    })
    .optional(),
  nextCursor: z.string().nullable(),
  dataVersion: z.string(),
});
export type AccommodationSearchResponse = z.infer<typeof AccommodationSearchResponse>;

/** GET /search/food query params — mess/tiffin/restaurant search, parity with accommodation search. */
export const FoodSearchQuery = z.object({
  destinationId: z.string(),
  kinds: z.array(FoodKind).default([]),
  vegOnly: z.boolean().optional(),
  priceMax: z.number().int().positive().optional(),
  radiusKm: z.number().min(0.5).max(30).default(3),
  sort: z.enum(["recommended", "price", "closest"]).default("recommended"),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type FoodSearchQuery = z.infer<typeof FoodSearchQuery>;

export const FoodSearchItem = z.object({
  placeId: z.string(),
  slug: z.string(),
  name: z.string(),
  kind: FoodKind,
  location: z.object({ lat: z.number(), lng: z.number() }),
  foodPlan: z.object({
    id: z.string(),
    vegOnly: z.boolean().nullable(),
    delivers: z.boolean().nullable(),
    meals: z.array(z.string()),
    pricePaise: paiseSchema,
    priceBasis: z.enum(["PER_MEAL", "PER_DAY", "PER_WEEK", "PER_MONTH"]),
  }),
  distanceM: z.number().int(),
  reasons: z.array(z.object({ code: ReasonCode, value: z.string().optional() })),
  isSample: z.boolean().default(false),
});
export type FoodSearchItem = z.infer<typeof FoodSearchItem>;

export const FoodSearchResponse = z.object({
  destination: z.object({ id: z.string(), name: z.string() }),
  items: z.array(FoodSearchItem),
  facets: z.object({
    kinds: z.record(z.string(), z.number().int()),
    counts: z.object({ total: z.number().int() }),
  }),
  nextCursor: z.string().nullable(),
  dataVersion: z.string(),
});
export type FoodSearchResponse = z.infer<typeof FoodSearchResponse>;
