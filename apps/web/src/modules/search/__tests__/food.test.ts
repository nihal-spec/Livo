import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { searchFood } from "../food.js";
import { FoodSearchQuery } from "@livo/schemas";

/**
 * Parity with search.test.ts, against the synthetic dev food fixtures
 * (prisma/seed.dev.ts). Skips gracefully if that seed hasn't been run.
 */
describe("searchFood", () => {
  let infoparkPhase1Id: string;
  let haveFixtures = false;

  beforeAll(async () => {
    const dest = await prisma.destination.findUniqueOrThrow({ where: { slug: "infopark-phase-1-kochi" } });
    infoparkPhase1Id = dest.id;
    const count = await prisma.place.count({ where: { slug: { startsWith: "dev-mess-" } } });
    haveFixtures = count > 0;
  });

  function baseQuery(overrides: Partial<FoodSearchQuery> = {}): FoodSearchQuery {
    return FoodSearchQuery.parse({
      destinationId: infoparkPhase1Id,
      radiusKm: 15,
      ...overrides,
    });
  }

  it("returns food results within the radius with a distance", async () => {
    if (!haveFixtures) return;
    const result = await searchFood(baseQuery());
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.distanceM).toBeGreaterThanOrEqual(0);
      expect(item.foodPlan.pricePaise).toBeGreaterThan(0n);
    }
  });

  it("excludes results outside a tight radius", async () => {
    if (!haveFixtures) return;
    const tight = await searchFood(baseQuery({ radiusKm: 0.5 }));
    const wide = await searchFood(baseQuery({ radiusKm: 30 }));
    expect(tight.items.length).toBeLessThanOrEqual(wide.items.length);
  });

  it("filters by vegOnly", async () => {
    if (!haveFixtures) return;
    const result = await searchFood(baseQuery({ vegOnly: true }));
    expect(result.items.every((i) => i.foodPlan.vegOnly === true)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("filters by kinds", async () => {
    if (!haveFixtures) return;
    const result = await searchFood(baseQuery({ kinds: ["MESS"] }));
    expect(result.items.every((i) => i.kind === "MESS")).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("sorts by price ascending when sort=price", async () => {
    if (!haveFixtures) return;
    const result = await searchFood(baseQuery({ sort: "price" }));
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i].foodPlan.pricePaise >= result.items[i - 1].foodPlan.pricePaise).toBe(true);
    }
  });

  it("throws NOT_FOUND for an unknown destination", async () => {
    await expect(searchFood(baseQuery({ destinationId: "nonexistent_dest" }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
