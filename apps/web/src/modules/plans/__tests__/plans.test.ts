import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { emptyTripRequirements } from "@livo/schemas";
import { createGuestSession } from "@/modules/auth/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { addPlanItem, createPlan, getPlan, listPlans, removePlanItem, setPlanSharing } from "../index.js";

describe("plans module", () => {
  let destinationId: string;
  let roomOptionId: string;

  beforeAll(async () => {
    const dest = await prisma.destination.findFirstOrThrow();
    destinationId = dest.id;
    const room = await prisma.roomOption.findFirstOrThrow();
    roomOptionId = room.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a plan owned by a guest session", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Test plan",
        purpose: "JOB_RELOCATION",
        destinationId,
        startDate: "2026-11-01",
        endDate: "2027-01-30",
        requirements: emptyTripRequirements(),
      },
    );
    expect(plan.guestSessionId).toBe(guestSessionId);
    expect(plan.ownerUserId).toBeNull();
  });

  it("rejects creating a plan for an anonymous viewer", async () => {
    await expect(
      createPlan(
        { kind: "anonymous" },
        {
          title: "Nope",
          purpose: "TRIP",
          destinationId,
          startDate: "2026-11-01",
          endDate: "2026-11-05",
          requirements: emptyTripRequirements(),
        },
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it("lets the owning guest read their plan but not a different guest", async () => {
    const { id: ownerGuestId } = await createGuestSession();
    const { id: otherGuestId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId: ownerGuestId },
      {
        title: "Owned plan",
        purpose: "STUDY",
        destinationId,
        startDate: "2026-11-01",
        endDate: "2026-12-01",
        requirements: emptyTripRequirements(),
      },
    );

    const found = await getPlan(plan.id, { kind: "guest", guestSessionId: ownerGuestId });
    expect(found?.id).toBe(plan.id);

    await expect(getPlan(plan.id, { kind: "guest", guestSessionId: otherGuestId })).rejects.toThrow(ForbiddenError);
  });

  it("allows read-only access via a valid share token", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const { id: otherGuestId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Shared plan",
        purpose: "HOSPITAL_ATTENDANT",
        destinationId,
        startDate: "2026-11-01",
        endDate: "2026-11-21",
        requirements: emptyTripRequirements(),
      },
    );

    const shareToken = await setPlanSharing(plan.id, { kind: "guest", guestSessionId }, true);
    expect(shareToken).toBeTruthy();

    const viaShare = await getPlan(plan.id, { kind: "guest", guestSessionId: otherGuestId }, shareToken!);
    expect(viaShare?.id).toBe(plan.id);

    await setPlanSharing(plan.id, { kind: "guest", guestSessionId }, false);
    await expect(
      getPlan(plan.id, { kind: "guest", guestSessionId: otherGuestId }, shareToken!),
    ).rejects.toThrow(ForbiddenError);
  });

  it("adds and removes plan items, only for the owner", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const { id: otherGuestId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Item plan",
        purpose: "INTERNSHIP",
        destinationId,
        startDate: "2026-11-01",
        endDate: "2027-05-01",
        requirements: emptyTripRequirements(),
      },
    );

    const item = await addPlanItem(plan.id, { kind: "guest", guestSessionId }, {
      kind: "ACCOMMODATION",
      roomOptionId,
    });
    expect(item.roomOptionId).toBe(roomOptionId);

    await expect(
      addPlanItem(plan.id, { kind: "guest", guestSessionId: otherGuestId }, { kind: "ACCOMMODATION", roomOptionId }),
    ).rejects.toThrow(ForbiddenError);

    await removePlanItem(plan.id, item.id, { kind: "guest", guestSessionId });
    const remaining = await prisma.planItem.findMany({ where: { planId: plan.id } });
    expect(remaining).toHaveLength(0);
  });

  it("lists only the viewer's own plans, most recently updated first", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const { id: otherGuestId } = await createGuestSession();

    const first = await createPlan(
      { kind: "guest", guestSessionId },
      { title: "First", purpose: "TRIP", destinationId, startDate: "2026-11-01", endDate: "2026-11-05", requirements: emptyTripRequirements() },
    );
    const second = await createPlan(
      { kind: "guest", guestSessionId },
      { title: "Second", purpose: "TRIP", destinationId, startDate: "2026-12-01", endDate: "2026-12-05", requirements: emptyTripRequirements() },
    );
    await createPlan(
      { kind: "guest", guestSessionId: otherGuestId },
      { title: "Someone else's", purpose: "TRIP", destinationId, startDate: "2026-11-01", endDate: "2026-11-05", requirements: emptyTripRequirements() },
    );

    const mine = await listPlans({ kind: "guest", guestSessionId });
    expect(mine.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(mine.every((p) => p.title !== "Someone else's")).toBe(true);
  });

  it("returns an empty list for an anonymous viewer", async () => {
    const plans = await listPlans({ kind: "anonymous" });
    expect(plans).toEqual([]);
  });
});
