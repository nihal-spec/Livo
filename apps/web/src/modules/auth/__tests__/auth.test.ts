import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import {
  createGuestSession,
  findGuestSessionByToken,
  getViewerFromCookie,
  mergeGuestIntoUser,
  touchGuestSession,
} from "../index.js";

describe("guest sessions", () => {
  const cleanupUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await prisma.$disconnect();
  });

  it("creates a session whose raw token round-trips through findGuestSessionByToken", async () => {
    const { token, id } = await createGuestSession();
    const found = await findGuestSessionByToken(token);
    expect(found?.id).toBe(id);
  });

  it("never stores the raw token — only its hash is queryable", async () => {
    const { token } = await createGuestSession();
    const raw = await prisma.guestSession.findUnique({ where: { id: token } });
    expect(raw).toBeNull(); // the raw token is not a valid row id (it's unhashed)
  });

  it("returns null for an unknown token", async () => {
    expect(await findGuestSessionByToken("not-a-real-token")).toBeNull();
  });

  it("resolves an anonymous viewer when no cookie is present", async () => {
    expect(await getViewerFromCookie(undefined)).toEqual({ kind: "anonymous" });
  });

  it("resolves a guest viewer for a valid cookie", async () => {
    const { token, id } = await createGuestSession();
    expect(await getViewerFromCookie(token)).toEqual({ kind: "guest", guestSessionId: id });
  });

  it("touchGuestSession extends expiresAt", async () => {
    const { id } = await createGuestSession();
    const before = await prisma.guestSession.findUniqueOrThrow({ where: { id } });
    const newExpiry = await touchGuestSession(id);
    expect(newExpiry.getTime()).toBeGreaterThan(before.expiresAt.getTime() - 1000);
  });

  it("mergeGuestIntoUser reassigns the guest's plans and marks the session merged", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const userId = "test_user_merge_target";
    cleanupUserIds.push(userId);
    await prisma.user.create({ data: { id: userId, email: "merge-target@test.livo.local" } });

    const destination = await prisma.destination.findFirstOrThrow();
    await prisma.plan.create({
      data: {
        guestSessionId,
        title: "Test guest plan",
        purpose: "JOB_RELOCATION",
        destinationId: destination.id,
        startDate: new Date("2026-11-01"),
        endDate: new Date("2026-12-01"),
        requirements: { v: 1 },
      },
    });

    const { plansMoved } = await mergeGuestIntoUser(guestSessionId, userId);
    expect(plansMoved).toBe(1);

    const movedPlan = await prisma.plan.findFirstOrThrow({ where: { ownerUserId: userId } });
    expect(movedPlan.guestSessionId).toBeNull();

    const session = await prisma.guestSession.findUniqueOrThrow({ where: { id: guestSessionId } });
    expect(session.mergedIntoUserId).toBe(userId);

    await prisma.plan.deleteMany({ where: { ownerUserId: userId } });
  });
});
