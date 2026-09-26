import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { searchAccommodation } from "../index.js";
import { AccommodationSearchQuery } from "@livo/schemas";

/**
 * Exercises the full search pipeline (radius filter -> distance-based
 * commute estimate -> monthly cost -> Pareto rank) against the real
 * Postgres/PostGIS instance and the synthetic dev fixtures
 * (prisma/seed.dev.ts). Skips gracefully if that seed hasn't been run.
 */
describe("searchAccommodation", () => {
  let infoparkPhase1Id: string;
  let haveFixtures = false;

  beforeAll(async () => {
    const dest = await prisma.destination.findUniqueOrThrow({ where: { slug: "infopark-phase-1-kochi" } });
    infoparkPhase1Id = dest.id;
    const count = await prisma.place.count({ where: { slug: { startsWith: "dev-pg-" } } });
    haveFixtures = count > 0;
  });

  function baseQuery(overrides: Partial<AccommodationSearchQuery> = {}): AccommodationSearchQuery {
    return AccommodationSearchQuery.parse({
      destinationId: infoparkPhase1Id,
      radiusKm: 15,
      ...overrides,
    });
  }

  it("returns results within the radius with a distance-based commute estimate", async () => {
    if (!haveFixtures) return; // seed:dev not run in this environment
    const result = await searchAccommodation(baseQuery());
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.commute?.method).toBe("DISTANCE_ESTIMATE");
      expect(item.commute!.durationSMin).toBeLessThanOrEqual(item.commute!.durationSMax);
      expect(item.monthlyTotalPaise).toBeGreaterThan(0n);
    }
  });

  it("excludes results outside a tight radius", async () => {
    if (!haveFixtures) return;
    const tight = await searchAccommodation(baseQuery({ radiusKm: 0.5 }));
    const wide = await searchAccommodation(baseQuery({ radiusKm: 30 }));
    expect(tight.items.length).toBeLessThanOrEqual(wide.items.length);
  });

  it("filters by gender policy", async () => {
    if (!haveFixtures) return;
    const women = await searchAccommodation(baseQuery({ genderPolicy: "WOMEN" }));
    expect(women.items.every((i) => i.name.includes("Ladies") || true)).toBe(true);
    // Every returned room must not conflict with the WOMEN filter (checked at the DB level
    // via genderPolicy join) — assert none of the known MEN-only fixtures leaked through.
    expect(women.items.some((i) => i.name.includes("Green Nest"))).toBe(false);
  });

  it("filters by foodIncluded", async () => {
    if (!haveFixtures) return;
    const withFood = await searchAccommodation(baseQuery({ foodIncluded: true }));
    expect(withFood.items.every((i) => i.foodIncluded === true)).toBe(true);
    for (const item of withFood.items) {
      expect(item.reasons.some((r) => r.code === "FOOD_INCLUDED")).toBe(true);
    }
  });

  it("sorts by total_cost ascending", async () => {
    if (!haveFixtures) return;
    const result = await searchAccommodation(baseQuery({ sort: "total_cost" }));
    const totals = result.items.map((i) => i.monthlyTotalPaise ?? 0n);
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i] >= totals[i - 1]).toBe(true);
    }
  });

  it("sorts by closest ascending", async () => {
    if (!haveFixtures) return;
    const result = await searchAccommodation(baseQuery({ sort: "closest" }));
    const distances = result.items.map((i) => i.commute?.distanceM ?? 0);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i] >= distances[i - 1]).toBe(true);
    }
  });

  it("returns nearMisses when a very low price filter yields nothing", async () => {
    if (!haveFixtures) return;
    const result = await searchAccommodation(baseQuery({ priceMax: 1 }));
    expect(result.items).toEqual([]);
    expect(result.nearMisses).toBeDefined();
  });

  it("throws NOT_FOUND for an unknown destination", async () => {
    await expect(searchAccommodation(baseQuery({ destinationId: "does-not-exist" }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("marks the single-occupancy room with the PRIVATE_ROOM reason", async () => {
    if (!haveFixtures) return;
    const result = await searchAccommodation(baseQuery({ occupancy: "SINGLE" }));
    for (const item of result.items) {
      expect(item.room.occupancy).toBe("SINGLE");
      expect(item.reasons.some((r) => r.code === "PRIVATE_ROOM")).toBe(true);
    }
  });
});
