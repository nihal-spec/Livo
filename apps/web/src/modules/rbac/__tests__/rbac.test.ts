import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { can, requirePermission, ForbiddenError, assertNotSelfRoleChange } from "../index.js";

/**
 * Permission-matrix test (ARCHITECTURE.md §14): every role seeded by
 * prisma/seed.ts is checked against a representative permission it should
 * and shouldn't have, against the real roles/role_permission tables.
 */
describe("rbac", () => {
  const dataManagerUserId = "test_user_data_manager";
  const supportUserId = "test_user_support";

  beforeAll(async () => {
    const dataManagerRole = await prisma.role.findUniqueOrThrow({ where: { key: "data_manager" } });
    const supportRole = await prisma.role.findUniqueOrThrow({ where: { key: "support" } });

    await prisma.user.upsert({
      where: { id: dataManagerUserId },
      update: {},
      create: { id: dataManagerUserId, email: "data-manager@test.livo.local" },
    });
    await prisma.user.upsert({
      where: { id: supportUserId },
      update: {},
      create: { id: supportUserId, email: "support@test.livo.local" },
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
    await prisma.userRole.deleteMany({ where: { userId: { in: [dataManagerUserId, supportUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [dataManagerUserId, supportUserId] } } });
    await prisma.$disconnect();
  });

  it("grants a Data Manager places:verify and places:publish", async () => {
    expect(await can(dataManagerUserId, "places:verify")).toBe(true);
    expect(await can(dataManagerUserId, "places:publish")).toBe(true);
  });

  it("does not grant a Data Manager roles:manage (Super Admin only)", async () => {
    expect(await can(dataManagerUserId, "roles:manage")).toBe(false);
  });

  it("grants Support users:pii but not users:suspend", async () => {
    expect(await can(supportUserId, "users:pii")).toBe(true);
    expect(await can(supportUserId, "users:suspend")).toBe(false);
  });

  it("does not grant Support places:publish", async () => {
    expect(await can(supportUserId, "places:publish")).toBe(false);
  });

  it("requirePermission throws ForbiddenError when the permission is missing", async () => {
    await expect(requirePermission(supportUserId, "places:publish")).rejects.toThrow(ForbiddenError);
  });

  it("requirePermission resolves silently when the permission is present", async () => {
    await expect(requirePermission(dataManagerUserId, "places:verify")).resolves.toBeUndefined();
  });

  it("returns false (not an error) for a user with no roles at all", async () => {
    expect(await can("nonexistent_user_id", "dashboard:view")).toBe(false);
  });

  it("blocks a user from changing their own roles", () => {
    expect(() => assertNotSelfRoleChange("u1", "u1")).toThrow(ForbiddenError);
    expect(() => assertNotSelfRoleChange("u1", "u2")).not.toThrow();
  });
});
