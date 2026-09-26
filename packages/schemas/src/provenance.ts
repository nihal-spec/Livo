import { z } from "zod";
import { SourceType } from "./enums.js";

/**
 * Field-level provenance for any fact shown in the product (price, deposit,
 * availability, amenity, ...). AI must never invent these — they always come
 * from a FactProvenance row. See DATA_STRATEGY.md and DATABASE_DESIGN.md.
 */
export const FactProvenance = z.object({
  sourceType: SourceType,
  dataSourceId: z.string(),
  observedAt: z.string().datetime(),
  verifiedAt: z.string().datetime().nullable().optional(),
  verifiedByAdminId: z.string().nullable().optional(),
  method: z
    .enum(["PHONE_CALL", "SITE_VISIT", "PARTNER_PORTAL", "DOCUMENT", "API_SYNC", "USER_REPORT"])
    .nullable()
    .optional(),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  note: z.string().nullable().optional(),
});
export type FactProvenance = z.infer<typeof FactProvenance>;

/** Display state derived from provenance + freshness TTL (never stored, always computed). */
export const ProvenanceDisplay = z.object({
  label: z.enum([
    "VERIFIED",
    "FROM_BUSINESS",
    "FROM_API",
    "ESTIMATED",
    "REPORTED_BY_USERS",
    "MAY_BE_OUTDATED",
  ]),
  stale: z.boolean(),
  ageDays: z.number().int().nonnegative(),
});
export type ProvenanceDisplay = z.infer<typeof ProvenanceDisplay>;

/** Freshness TTL per fact type, in days. See DATA_STRATEGY.md §2. */
export const FRESHNESS_TTL_DAYS = {
  price: 45,
  deposit: 90,
  availability: 7,
  foodIncluded: 90,
  amenities: 180,
  operatingStatus: 90,
  messPrice: 60,
} as const;

export type FreshnessFactKey = keyof typeof FRESHNESS_TTL_DAYS;

export function deriveProvenanceDisplay(
  provenance: Pick<FactProvenance, "sourceType" | "observedAt">,
  factKey: FreshnessFactKey,
  now: Date = new Date(),
): ProvenanceDisplay {
  const observed = new Date(provenance.observedAt);
  const ageDays = Math.max(0, Math.floor((now.getTime() - observed.getTime()) / 86_400_000));
  const ttl = FRESHNESS_TTL_DAYS[factKey];
  const stale = ageDays > ttl;

  if (stale) return { label: "MAY_BE_OUTDATED", stale: true, ageDays };

  const label = {
    VERIFIED: "VERIFIED",
    PARTNER: "FROM_BUSINESS",
    API: "FROM_API",
    ESTIMATED: "ESTIMATED",
    USER: "REPORTED_BY_USERS",
    IMPORTED: "FROM_API",
  } as const satisfies Record<z.infer<typeof SourceType>, ProvenanceDisplay["label"]>;

  return { label: label[provenance.sourceType], stale: false, ageDays };
}
