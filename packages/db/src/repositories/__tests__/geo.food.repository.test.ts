import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../index.js";
import { findFoodCandidates } from "../geo.repository.js";

/**
 * Integration test for the food-search geo layer, parity with
 * geo.repository.test.ts's findAccommodationCandidates coverage. Uses the
 * same isolated "ocean" fixture coordinates as that file to avoid
 * colliding with dev seed data.
 */
describe("findFoodCandidates", () => {
  const regionId = "test_region_geo_food";
  const destId = "test_dest_geo_food";
  const nearPlaceId = "test_food_near";
  const farPlaceId = "test_food_far";

  beforeAll(async () => {
    await prisma.$executeRaw`
      INSERT INTO "region" ("id", "kind", "slug", "name", "centroid")
      VALUES (${regionId}, 'CITY', 'test-region-geo-food', 'Test Region Food', ST_SetSRID(ST_MakePoint(-41.00, 1.00), 4326)::geography)
      ON CONFLICT ("id") DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO "destination" ("id", "slug", "name", "kind", "regionId", "location", "isAnchor")
      VALUES (${destId}, 'test-dest-geo-food', 'Test Destination Food', 'OFFICE_PARK', ${regionId},
        ST_SetSRID(ST_MakePoint(-41.00, 1.00), 4326)::geography, false)
      ON CONFLICT ("id") DO NOTHING
    `;

    await prisma.$executeRaw`
      INSERT INTO "place" ("id", "slug", "category", "name", "regionId", "location", "addressLine", "status", "updatedAt")
      VALUES (${nearPlaceId}, ${nearPlaceId}, 'FOOD', 'Near Mess', ${regionId},
        ST_SetSRID(ST_MakePoint(-40.999, 1.001), 4326)::geography, 'Test address', 'PUBLISHED', now())
      ON CONFLICT ("id") DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO "place" ("id", "slug", "category", "name", "regionId", "location", "addressLine", "status", "updatedAt")
      VALUES (${farPlaceId}, ${farPlaceId}, 'FOOD', 'Far Mess', ${regionId},
        ST_SetSRID(ST_MakePoint(-40.70, 1.25), 4326)::geography, 'Test address', 'PUBLISHED', now())
      ON CONFLICT ("id") DO NOTHING
    `;

    await prisma.foodPlan.upsert({
      where: { id: "test_foodplan_near" },
      update: {},
      create: {
        id: "test_foodplan_near",
        placeId: nearPlaceId,
        kind: "MESS",
        meals: ["LUNCH", "DINNER"],
        vegOnly: true,
        priceBasis: "PER_MONTH",
        pricePaise: 300_000n,
      },
    });
    await prisma.foodPlan.upsert({
      where: { id: "test_foodplan_far" },
      update: {},
      create: {
        id: "test_foodplan_far",
        placeId: farPlaceId,
        kind: "RESTAURANT",
        meals: ["LUNCH", "DINNER"],
        vegOnly: false,
        priceBasis: "PER_MEAL",
        pricePaise: 20_000n,
      },
    });
  });

  afterAll(async () => {
    await prisma.foodPlan.deleteMany({ where: { placeId: { in: [nearPlaceId, farPlaceId] } } });
    await prisma.place.deleteMany({ where: { id: { in: [nearPlaceId, farPlaceId] } } });
    await prisma.destination.delete({ where: { id: destId } }).catch(() => {});
    await prisma.region.delete({ where: { id: regionId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("returns only food places within the radius, ordered by distance", async () => {
    const results = await findFoodCandidates({ destinationId: destId, radiusM: 5_000 });
    const ids = results.map((r) => r.placeId);
    expect(ids).toContain(nearPlaceId);
    expect(ids).not.toContain(farPlaceId);
  });

  it("finds the far place once the radius is widened", async () => {
    const results = await findFoodCandidates({ destinationId: destId, radiusM: 50_000 });
    const ids = results.map((r) => r.placeId);
    expect(ids).toContain(nearPlaceId);
    expect(ids).toContain(farPlaceId);
    expect(ids.indexOf(nearPlaceId)).toBeLessThan(ids.indexOf(farPlaceId));
  });

  it("applies the vegOnly filter", async () => {
    const results = await findFoodCandidates({ destinationId: destId, radiusM: 50_000, vegOnly: true });
    expect(results.map((r) => r.placeId)).toEqual([nearPlaceId]);
  });

  it("applies the price filter", async () => {
    const results = await findFoodCandidates({ destinationId: destId, radiusM: 50_000, priceMaxPaise: 25_000n });
    expect(results.map((r) => r.placeId)).toEqual([farPlaceId]);
  });

  it("applies the kinds filter", async () => {
    const results = await findFoodCandidates({ destinationId: destId, radiusM: 50_000, kinds: ["MESS"] });
    expect(results.map((r) => r.placeId)).toEqual([nearPlaceId]);
  });
});
