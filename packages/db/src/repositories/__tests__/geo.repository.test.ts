import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../index.js";
import { findAccommodationCandidates, setPlaceLocation } from "../geo.repository.js";

/**
 * Integration test against a real Postgres + PostGIS instance (see
 * ARCHITECTURE.md §14 — Testcontainers in CI; here it runs against the
 * local dev DB via DATABASE_URL). Exercises the raw-SQL geo layer end to
 * end: radius filter, join to room options, distance ordering.
 */
describe("findAccommodationCandidates", () => {
  const regionId = "test_region_geo";
  const destId = "test_dest_geo";
  const nearPlaceId = "test_place_near";
  const farPlaceId = "test_place_far";

  beforeAll(async () => {
    await prisma.$executeRaw`
      INSERT INTO "region" ("id", "kind", "slug", "name", "centroid")
      VALUES (${regionId}, 'CITY', 'test-region-geo', 'Test Region', ST_SetSRID(ST_MakePoint(76.30, 10.00), 4326)::geography)
      ON CONFLICT ("id") DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO "destination" ("id", "slug", "name", "kind", "regionId", "location", "isAnchor")
      VALUES (${destId}, 'test-dest-geo', 'Test Destination', 'OFFICE_PARK', ${regionId},
        ST_SetSRID(ST_MakePoint(76.30, 10.00), 4326)::geography, false)
      ON CONFLICT ("id") DO NOTHING
    `;

    // `location` is a required PostGIS geography column, Unsupported by the
    // Prisma client (same reason as the seed script) — insert raw.
    await prisma.$executeRaw`
      INSERT INTO "place" ("id", "slug", "category", "name", "regionId", "location", "addressLine", "status", "updatedAt")
      VALUES (${nearPlaceId}, ${nearPlaceId}, 'ACCOMMODATION', 'Near PG', ${regionId},
        ST_SetSRID(ST_MakePoint(76.301, 10.001), 4326)::geography, 'Test address', 'PUBLISHED', now())
      ON CONFLICT ("id") DO NOTHING
    `;
    await prisma.$executeRaw`
      INSERT INTO "place" ("id", "slug", "category", "name", "regionId", "location", "addressLine", "status", "updatedAt")
      VALUES (${farPlaceId}, ${farPlaceId}, 'ACCOMMODATION', 'Far PG', ${regionId},
        ST_SetSRID(ST_MakePoint(76.50, 10.20), 4326)::geography, 'Test address', 'PUBLISHED', now())
      ON CONFLICT ("id") DO NOTHING
    `;

    await prisma.roomOption.upsert({
      where: { id: "test_room_near" },
      update: {},
      create: {
        id: "test_room_near",
        placeId: nearPlaceId,
        occupancy: "DOUBLE",
        ac: false,
        privateBath: true,
        priceBasis: "PER_MONTH",
        pricePaise: 650_000n,
      },
    });
    await prisma.roomOption.upsert({
      where: { id: "test_room_far" },
      update: {},
      create: {
        id: "test_room_far",
        placeId: farPlaceId,
        occupancy: "DOUBLE",
        ac: false,
        privateBath: true,
        priceBasis: "PER_MONTH",
        pricePaise: 500_000n,
      },
    });
  });

  afterAll(async () => {
    await prisma.roomOption.deleteMany({ where: { placeId: { in: [nearPlaceId, farPlaceId] } } });
    await prisma.place.deleteMany({ where: { id: { in: [nearPlaceId, farPlaceId] } } });
    await prisma.destination.delete({ where: { id: destId } }).catch(() => {});
    await prisma.region.delete({ where: { id: regionId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("returns only places within the radius, ordered by distance", async () => {
    const results = await findAccommodationCandidates({ destinationId: destId, radiusM: 5_000 });
    const ids = results.map((r) => r.placeId);
    expect(ids).toContain(nearPlaceId);
    expect(ids).not.toContain(farPlaceId);
  });

  it("finds the far place once the radius is widened", async () => {
    const results = await findAccommodationCandidates({ destinationId: destId, radiusM: 50_000 });
    const ids = results.map((r) => r.placeId);
    expect(ids).toContain(nearPlaceId);
    expect(ids).toContain(farPlaceId);
    // Nearer place should sort first.
    expect(ids.indexOf(nearPlaceId)).toBeLessThan(ids.indexOf(farPlaceId));
  });

  it("applies the price filter", async () => {
    const results = await findAccommodationCandidates({
      destinationId: destId,
      radiusM: 50_000,
      priceMinPaise: 600_000n,
    });
    expect(results.map((r) => r.placeId)).toEqual([nearPlaceId]);
  });

  it("setPlaceLocation moves a pin and the search reflects it immediately", async () => {
    await setPlaceLocation(farPlaceId, { lat: 10.001, lng: 76.301 }); // move far place next to destination
    const results = await findAccommodationCandidates({ destinationId: destId, radiusM: 500 });
    expect(results.map((r) => r.placeId)).toContain(farPlaceId);
  });
});
