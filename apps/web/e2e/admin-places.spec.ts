import { test, expect } from "@playwright/test";
import { prisma } from "@livo/db";

/**
 * Admin listings editor (ADMIN_SPEC.md §3-4): create -> reject invalid
 * publish -> review -> verify -> publish. Uses the dev-only
 * x-livo-admin-user-id header (lib/adminAuth.ts) since Auth.js sign-in
 * isn't wired up yet — this header only works under `next dev`, which is
 * exactly what playwright.config.ts's webServer runs.
 */
test.describe("admin places workflow", () => {
  const adminUserId = "e2e_admin_dm";
  const supportUserId = "e2e_admin_support";
  let regionId: string;
  const createdPlaceIds: string[] = [];

  test.beforeAll(async () => {
    const region = await prisma.region.findUniqueOrThrow({ where: { slug: "kochi" } });
    regionId = region.id;
    const dataManagerRole = await prisma.role.findUniqueOrThrow({ where: { key: "data_manager" } });
    const supportRole = await prisma.role.findUniqueOrThrow({ where: { key: "support" } });

    await prisma.user.upsert({
      where: { id: adminUserId },
      update: {},
      create: { id: adminUserId, email: "e2e-admin@test.livo.local" },
    });
    await prisma.user.upsert({
      where: { id: supportUserId },
      update: {},
      create: { id: supportUserId, email: "e2e-support@test.livo.local" },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUserId, roleId: dataManagerRole.id } },
      update: {},
      create: { userId: adminUserId, roleId: dataManagerRole.id, grantedById: "e2e" },
    });
    // Support has places:read but not places:create/publish (ADMIN_SPEC.md §2).
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: supportUserId, roleId: supportRole.id } },
      update: {},
      create: { userId: supportUserId, roleId: supportRole.id, grantedById: "e2e" },
    });
  });

  test.afterAll(async () => {
    await prisma.factProvenance.deleteMany({ where: { placeId: { in: createdPlaceIds } } });
    await prisma.accommodationDetail.deleteMany({ where: { placeId: { in: createdPlaceIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdPlaceIds } } });
    await prisma.place.deleteMany({ where: { id: { in: createdPlaceIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: [adminUserId, supportUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, supportUserId] } } });
    await prisma.$disconnect();
  });

  test("create, reject invalid publish, verify, and publish a listing", async ({ request }) => {
    const createRes = await request.post("/api/v1/admin/places", {
      headers: { "x-livo-admin-user-id": adminUserId },
      data: {
        name: "[E2E] Test PG",
        slug: `e2e-test-pg-${Date.now()}`,
        regionId,
        addressLine: "E2E test address",
        location: { lat: 10.02, lng: 76.35 },
        accommodation: { kind: "PG", genderPolicy: "ANY", foodIncluded: false },
      },
    });
    expect(createRes.status()).toBe(201);
    const place = await createRes.json();
    createdPlaceIds.push(place.id);
    expect(place.status).toBe("DRAFT");

    // Publishing straight from DRAFT must be rejected (ADMIN_SPEC.md §3-4 state machine).
    const invalidPublish = await request.post(`/api/v1/admin/places/${place.id}/publish`, {
      headers: { "x-livo-admin-user-id": adminUserId },
      data: { status: "PUBLISHED" },
    });
    expect(invalidPublish.status()).toBe(409);

    const toPending = await request.post(`/api/v1/admin/places/${place.id}/publish`, {
      headers: { "x-livo-admin-user-id": adminUserId },
      data: { status: "PENDING_REVIEW" },
    });
    expect(toPending.status()).toBe(200);

    const verify = await request.post(`/api/v1/admin/places/${place.id}/verify`, {
      headers: { "x-livo-admin-user-id": adminUserId },
      data: { factKey: "rent-price", method: "PHONE_CALL", note: "E2E test verification" },
    });
    expect(verify.status()).toBe(201);

    const publish = await request.post(`/api/v1/admin/places/${place.id}/publish`, {
      headers: { "x-livo-admin-user-id": adminUserId },
      data: { status: "PUBLISHED" },
    });
    expect(publish.status()).toBe(200);
    expect((await publish.json()).status).toBe("PUBLISHED");

    const auditEntries = await prisma.auditLog.findMany({ where: { entityId: place.id }, orderBy: { createdAt: "asc" } });
    expect(auditEntries.map((e) => e.action)).toEqual([
      "place.create",
      "place.status.pending_review",
      "place.fact.verify",
      "place.status.published",
    ]);
  });

  test("a Support-role viewer is refused with 403 trying to publish", async ({ request }) => {
    const createRes = await request.post("/api/v1/admin/places", {
      headers: { "x-livo-admin-user-id": adminUserId },
      data: {
        name: "[E2E] Support-denied PG",
        slug: `e2e-support-denied-${Date.now()}`,
        regionId,
        addressLine: "E2E test address",
        location: { lat: 10.02, lng: 76.35 },
        accommodation: { kind: "PG", genderPolicy: "ANY", foodIncluded: false },
      },
    });
    const place = await createRes.json();
    createdPlaceIds.push(place.id);

    await request.post(`/api/v1/admin/places/${place.id}/publish`, {
      headers: { "x-livo-admin-user-id": adminUserId },
      data: { status: "PENDING_REVIEW" },
    });

    const deniedPublish = await request.post(`/api/v1/admin/places/${place.id}/publish`, {
      headers: { "x-livo-admin-user-id": supportUserId },
      data: { status: "PUBLISHED" },
    });
    expect(deniedPublish.status()).toBe(403);
  });

  test("unauthenticated requests are refused with 401", async ({ request }) => {
    const res = await request.get("/api/v1/admin/places");
    expect(res.status()).toBe(401);
  });
});
