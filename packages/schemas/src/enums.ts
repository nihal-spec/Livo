import { z } from "zod";

export const PlaceCategory = z.enum([
  "ACCOMMODATION",
  "FOOD",
  "HOSPITAL",
  "PHARMACY",
  "DIAGNOSTICS",
  "GROCERY",
  "LAUNDRY",
  "ATM",
  "COWORKING",
  "GYM",
  "TRANSIT_HUB",
  "OTHER",
]);
export type PlaceCategory = z.infer<typeof PlaceCategory>;

export const AccommodationKind = z.enum([
  "PG",
  "HOSTEL",
  "COLIVING",
  "ROOM_RENTAL",
  "LODGE",
  "HOTEL",
  "SERVICE_APARTMENT",
  "DORMITORY",
]);
export type AccommodationKind = z.infer<typeof AccommodationKind>;

export const Occupancy = z.enum(["SINGLE", "DOUBLE", "TRIPLE", "DORM_4PLUS", "WHOLE_UNIT"]);
export type Occupancy = z.infer<typeof Occupancy>;

export const GenderPolicy = z.enum(["MEN", "WOMEN", "ANY", "FAMILY"]);
export type GenderPolicy = z.infer<typeof GenderPolicy>;

export const FoodKind = z.enum([
  "MESS",
  "TIFFIN",
  "RESTAURANT",
  "CLOUD_KITCHEN",
  "MEAL_SUBSCRIPTION",
  "GROCERY",
]);
export type FoodKind = z.infer<typeof FoodKind>;

export const PriceBasis = z.enum(["PER_NIGHT", "PER_WEEK", "PER_MONTH", "PER_MEAL", "PER_DAY"]);
export type PriceBasis = z.infer<typeof PriceBasis>;

export const PlaceStatus = z.enum([
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "UNVERIFIABLE",
  "CLOSED",
  "REJECTED",
]);
export type PlaceStatus = z.infer<typeof PlaceStatus>;

export const SourceType = z.enum(["VERIFIED", "PARTNER", "API", "ESTIMATED", "USER", "IMPORTED"]);
export type SourceType = z.infer<typeof SourceType>;

export const TravelMode = z.enum([
  "WALK",
  "TWO_WHEELER",
  "CAR",
  "AUTO",
  "CAB",
  "BUS",
  "METRO",
  "WATER_METRO",
  "MIXED_TRANSIT",
]);
export type TravelMode = z.infer<typeof TravelMode>;

export const PlanPurpose = z.enum([
  "JOB_RELOCATION",
  "INTERVIEW",
  "STUDY",
  "HOSPITAL_ATTENDANT",
  "INTERNSHIP",
  "TRAINING",
  "BUSINESS",
  "FAMILY_VISIT",
  "WORKATION",
  "TRIP",
  "OTHER",
]);
export type PlanPurpose = z.infer<typeof PlanPurpose>;

export const BudgetCategory = z.enum([
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
]);
export type BudgetCategory = z.infer<typeof BudgetCategory>;

export const Frequency = z.enum(["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "PER_NIGHT", "PER_MEAL"]);
export type Frequency = z.infer<typeof Frequency>;
