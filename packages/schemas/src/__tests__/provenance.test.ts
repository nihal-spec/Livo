import { describe, expect, it } from "vitest";
import { deriveProvenanceDisplay } from "../provenance.js";

describe("deriveProvenanceDisplay", () => {
  const now = new Date("2026-11-01T00:00:00Z");

  it("labels a fresh verified fact as VERIFIED", () => {
    const result = deriveProvenanceDisplay(
      { sourceType: "VERIFIED", observedAt: "2026-10-20T00:00:00Z" },
      "price",
      now,
    );
    expect(result).toEqual({ label: "VERIFIED", stale: false, ageDays: 12 });
  });

  it("labels a fact older than its TTL as MAY_BE_OUTDATED regardless of source", () => {
    const result = deriveProvenanceDisplay(
      { sourceType: "VERIFIED", observedAt: "2026-08-01T00:00:00Z" }, // 92 days, price TTL is 45
      "price",
      now,
    );
    expect(result.label).toBe("MAY_BE_OUTDATED");
    expect(result.stale).toBe(true);
  });

  it("maps each fresh source type to its display label", () => {
    const fresh = "2026-10-31T00:00:00Z";
    expect(deriveProvenanceDisplay({ sourceType: "PARTNER", observedAt: fresh }, "price", now).label).toBe(
      "FROM_BUSINESS",
    );
    expect(deriveProvenanceDisplay({ sourceType: "ESTIMATED", observedAt: fresh }, "price", now).label).toBe(
      "ESTIMATED",
    );
    expect(deriveProvenanceDisplay({ sourceType: "USER", observedAt: fresh }, "price", now).label).toBe(
      "REPORTED_BY_USERS",
    );
  });

  it("respects different TTLs per fact key", () => {
    const observedAt = "2026-09-15T00:00:00Z"; // 47 days before `now`
    // Price TTL is 45 days -> stale.
    expect(deriveProvenanceDisplay({ sourceType: "VERIFIED", observedAt }, "price", now).stale).toBe(true);
    // Amenities TTL is 180 days -> still fresh.
    expect(deriveProvenanceDisplay({ sourceType: "VERIFIED", observedAt }, "amenities", now).stale).toBe(false);
  });
});
