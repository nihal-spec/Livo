import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { ForbiddenError } from "@/modules/rbac/index.js";
import {
  addRoomOption,
  createPlace,
  InvalidTransitionError,
  listPlaces,
  OptimisticLockError,
  transitionPlaceStatus,
  updatePlace,
  verifyFact,
} from "../index.js";

describe("admin places service", () => {
  let regionId: string;
  let dataManagerUserId: string;
  let supportUserId: string; // lacks places:create/publish
  let requestCounter = 0;
  const createdPlaceIds: string[] = [];

  function nextActor(userId: string) {
    requestCounter += 1;
    return { userId, requestId: `test_admin_places_${requestCounter}` };
  }

  beforeAll(async () => {
    const region = await prisma.region.findUniqueOrThrow({ where: { slug: "kochi" } });
    regionId = region.id;

    const dataManagerRole = await prisma.role.findUniqueOrThrow({ where: { key: "data_manager" } });
    const supportRole = await prisma.role.findUniqueOrThrow({ where: { key: "support" } });

    dataManagerUserId = "test_admin_dm_places";
    supportUserId = "test_admin_support_places";

    await prisma.user.upsert({
      where: { id: dataManagerUserId },
      update: {},
      create: { id: dataManagerUserId, email: "dm-places@test.livo.local" },
    });
    await prisma.user.upsert({
      where: { id: supportUserId },
      update: {},
      create: { id: supportUserId, email: "support-places@test.livo.local" },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: dataManagerUserId, roleId: dataManagerRole.id } },
      update: {},
      create: { userId: dataManagerUserId, roleId: dataManagerRole.id, grantedById: "seed" },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: supportUserId, roleId: supportRole.id } },
      update: {},
      create: { userId: supportUserId, roleId: supportRole.id, grantedById: "seed" },
    });
  });

  afterAll(async () => {
    await prisma.roomOption.deleteMany({ where: { placeId: { in: createdPlaceIds } } });
    await prisma.factProvenance.deleteMany({ where: { placeId: { in: createdPlaceIds } } });
    await prisma.accommodationDetail.deleteMany({ where: { placeId: { in: createdPlaceIds } } });
    await prisma.place.deleteMany({ where: { id: { in: createdPlaceIds } } });
    await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: "test_admin_places_" } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: [dataManagerUserId, supportUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [dataManagerUserId, supportUserId] } } });
    await prisma.$disconnect();
  });

  async function makeTestPlace(suffix: string) {
    const place = await createPlace(nextActor(dataManagerUserId), {
      name: `[TEST] Admin Places ${suffix}`,
      slug: `test-admin-places-${suffix}-${Date.now()}`,
      regionId,
      addressLine: "Test address",
      location: { lat: 10.02, lng: 76.34 },
      accommodation: { kind: "PG", genderPolicy: "ANY", foodIncluded: false },
    });
    createdPlaceIds.push(place.id);
    return place;
  }

  it("creates a place with its geography pin and accommodation detail in one transaction", async () => {
    const place = await makeTestPlace("create");
    expect(place.status).toBe("DRAFT");

    const detail = await prisma.accommodationDetail.findUniqueOrThrow({ where: { placeId: place.id } });
    expect(detail.kind).toBe("PG");

    const [{ lat, lng }] = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
      SELECT ST_Y("location"::geometry) AS lat, ST_X("location"::geometry) AS lng FROM "place" WHERE "id" = ${place.id}
    `;
    expect(lat).toBeCloseTo(10.02, 3);
    expect(lng).toBeCloseTo(76.34, 3);
  });

  it("writes an audit log entry for place creation", async () => {
    const place = await makeTestPlace("audit");
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "Place", entityId: place.id, action: "place.create" },
    });
    expect(entry.actorUserId).toBe(dataManagerUserId);
    expect(entry.actorType).toBe("ADMIN");
  });

  it("rejects place creation for a viewer without places:create", async () => {
    await expect(
      createPlace(nextActor(supportUserId), {
        name: "Should not be created",
        slug: `test-admin-places-denied-${Date.now()}`,
        regionId,
        addressLine: "x",
        location: { lat: 10, lng: 76 },
        accommodation: { kind: "PG", genderPolicy: "ANY" },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("adds a room option to a place", async () => {
    const place = await makeTestPlace("room");
    const room = await addRoomOption(nextActor(dataManagerUserId), place.id, {
      occupancy: "DOUBLE",
      ac: false,
      privateBath: true,
      priceBasis: "PER_MONTH",
      pricePaise: 700_000n,
      depositPaise: 1_400_000n,
    });
    expect(room.placeId).toBe(place.id);
    expect(room.pricePaise).toBe(700_000n);
  });

  it("updates a place under optimistic locking, and rejects a stale version", async () => {
    const place = await makeTestPlace("update");
    const updated = await updatePlace(nextActor(dataManagerUserId), place.id, place.version, {
      name: "[TEST] Renamed",
    });
    expect(updated.name).toBe("[TEST] Renamed");
    expect(updated.version).toBe(place.version + 1);

    // Using the now-stale original version must fail.
    await expect(
      updatePlace(nextActor(dataManagerUserId), place.id, place.version, { name: "[TEST] Should fail" }),
    ).rejects.toThrow(OptimisticLockError);
  });

  it("verifyFact writes a HIGH-confidence VERIFIED provenance row", async () => {
    const place = await makeTestPlace("verify");
    const room = await addRoomOption(nextActor(dataManagerUserId), place.id, {
      occupancy: "SINGLE",
      ac: true,
      privateBath: true,
      priceBasis: "PER_MONTH",
      pricePaise: 900_000n,
    });

    const fact = await verifyFact(nextActor(dataManagerUserId), place.id, {
      factKey: `room:${room.id}:price`,
      method: "PHONE_CALL",
      note: "Confirmed with owner",
    });
    expect(fact.sourceType).toBe("VERIFIED");
    expect(fact.confidence).toBe("HIGH");
    expect(fact.verifiedById).toBe(dataManagerUserId);
  });

  it("rejects verifyFact for a viewer without places:verify", async () => {
    const place = await makeTestPlace("verify-denied");
    await expect(
      verifyFact(nextActor(supportUserId), place.id, { factKey: "x", method: "PHONE_CALL" }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("enforces the place status state machine", async () => {
    const place = await makeTestPlace("transitions");
    expect(place.status).toBe("DRAFT");

    // DRAFT -> PUBLISHED directly is not allowed.
    await expect(transitionPlaceStatus(nextActor(dataManagerUserId), place.id, "PUBLISHED")).rejects.toThrow(
      InvalidTransitionError,
    );

    const pending = await transitionPlaceStatus(nextActor(dataManagerUserId), place.id, "PENDING_REVIEW");
    expect(pending.status).toBe("PENDING_REVIEW");

    const published = await transitionPlaceStatus(nextActor(dataManagerUserId), place.id, "PUBLISHED");
    expect(published.status).toBe("PUBLISHED");

    // PUBLISHED -> DRAFT is not a listed transition.
    await expect(transitionPlaceStatus(nextActor(dataManagerUserId), place.id, "DRAFT")).rejects.toThrow(
      InvalidTransitionError,
    );
  });

  it("rejects publishing for a viewer without places:publish", async () => {
    const place = await makeTestPlace("publish-denied");
    await transitionPlaceStatus(nextActor(dataManagerUserId), place.id, "PENDING_REVIEW");
    // Support has places:read but not places:publish (see ADMIN_SPEC.md §2).
    await expect(transitionPlaceStatus(nextActor(supportUserId), place.id, "PUBLISHED")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("listPlaces filters by status and paginates", async () => {
    await makeTestPlace("list-a");
    await makeTestPlace("list-b");

    const draftPage = await listPlaces(nextActor(dataManagerUserId), { status: "DRAFT", pageSize: 1, page: 1 });
    expect(draftPage.items.length).toBe(1);
    expect(draftPage.total).toBeGreaterThanOrEqual(2);
  });

  it("rejects listPlaces for a viewer without places:read", async () => {
    const noRoleUserId = "test_admin_no_role";
    await prisma.user.upsert({
      where: { id: noRoleUserId },
      update: {},
      create: { id: noRoleUserId, email: "no-role@test.livo.local" },
    });
    await expect(listPlaces(nextActor(noRoleUserId))).rejects.toThrow(ForbiddenError);
    await prisma.user.delete({ where: { id: noRoleUserId } });
  });
});
