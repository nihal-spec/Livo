import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { mutateWithAudit, withAudit } from "../index.js";

describe("audit log", () => {
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: "test_req_" } } });
    await prisma.$disconnect();
  });

  it("writes an audit row with before/after captured as JSON", async () => {
    await withAudit(prisma, {
      actorUserId: null,
      actorType: "SYSTEM",
      action: "place.publish",
      entityType: "Place",
      entityId: "test_place_1",
      before: { status: "PENDING_REVIEW" },
      after: { status: "PUBLISHED" },
      reason: "four-eyes approval",
      requestId: "test_req_audit_1",
    });

    const row = await prisma.auditLog.findFirstOrThrow({ where: { requestId: "test_req_audit_1" } });
    expect(row.action).toBe("place.publish");
    expect(row.before).toEqual({ status: "PENDING_REVIEW" });
    expect(row.after).toEqual({ status: "PUBLISHED" });
  });

  it("mutateWithAudit only writes the audit row if the mutation commits", async () => {
    const region = await prisma.region.findFirstOrThrow();

    await mutateWithAudit(
      {
        actorUserId: null,
        actorType: "ADMIN",
        action: "region.rename",
        entityType: "Region",
        entityId: region.id,
        requestId: "test_req_audit_2",
      },
      async (tx) => {
        const updated = await tx.region.update({ where: { id: region.id }, data: { name: region.name } });
        return { result: updated, after: { name: updated.name } };
      },
    );

    const row = await prisma.auditLog.findFirstOrThrow({ where: { requestId: "test_req_audit_2" } });
    expect(row.entityId).toBe(region.id);
  });

  it("rolls back the audit row if the mutation throws", async () => {
    await expect(
      mutateWithAudit(
        {
          actorUserId: null,
          actorType: "ADMIN",
          action: "region.rename",
          entityType: "Region",
          entityId: "does-not-exist",
          requestId: "test_req_audit_3",
        },
        async () => {
          throw new Error("simulated failure");
        },
      ),
    ).rejects.toThrow("simulated failure");

    const row = await prisma.auditLog.findFirst({ where: { requestId: "test_req_audit_3" } });
    expect(row).toBeNull();
  });
});
