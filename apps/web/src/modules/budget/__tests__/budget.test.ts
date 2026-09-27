import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { emptyTripRequirements } from "@livo/schemas";
import { createGuestSession } from "@/modules/auth/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { createPlan, addPlanItem } from "@/modules/plans/index.js";
import { computeBudgetForPlan } from "../index.js";

describe("computeBudgetForPlan", () => {
  let destinationId: string;
  let roomOptionId: string;
  let roomPricePaise: bigint;
  let roomDepositPaise: bigint | null;

  beforeAll(async () => {
    const dest = await prisma.destination.findFirstOrThrow();
    destinationId = dest.id;
    const room = await prisma.roomOption.findFirstOrThrow();
    roomOptionId = room.id;
    roomPricePaise = room.pricePaise;
    roomDepositPaise = room.depositPaise;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("computes a real budget from a plan's accommodation item, grounded in DB facts", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Budget test plan",
        purpose: "JOB_RELOCATION",
        destinationId,
        startDate: "2026-11-01",
        endDate: "2027-01-30", // 90 days
        monthlyIncomePaise: 1_500_000n,
        cashOnHandPaise: 1_000_000n,
        requirements: emptyTripRequirements(),
      },
    );

    await addPlanItem(plan.id, { kind: "guest", guestSessionId }, { kind: "ACCOMMODATION", roomOptionId });

    const viewer = { kind: "guest" as const, guestSessionId };
    const result = await computeBudgetForPlan(plan.id, viewer);

    expect(result.days).toBe(90);
    // The rent line should be present at its real, DB-sourced price.
    const accommodationTotal = result.byCategory.ACCOMMODATION ?? 0n;
    expect(accommodationTotal).toBeGreaterThan(0n);
    expect(accommodationTotal % roomPricePaise === 0n || accommodationTotal === roomPricePaise * 3n).toBe(true);
    if (roomDepositPaise != null && roomDepositPaise > 0n) {
      expect(result.refundablePaise).toBe(roomDepositPaise);
    }
    expect(result.affordability).not.toBeNull();
    expect(result.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("adds a custom transport line entered by the user", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Custom line plan",
        purpose: "TRIP",
        destinationId,
        startDate: "2026-11-01",
        endDate: "2026-11-08", // 7 days
        requirements: emptyTripRequirements(),
      },
    );

    await addPlanItem(plan.id, { kind: "guest", guestSessionId }, {
      kind: "TRANSPORT",
      custom: { label: "Auto to office", amountPaise: "5000", frequency: "DAILY", category: "TRANSPORT" },
    });

    const result = await computeBudgetForPlan(plan.id, { kind: "guest", guestSessionId });
    expect(result.byCategory.TRANSPORT).toBe(5_000n * 7n);
  });

  it("adds a computed AUTO commute line when the room is far enough from the destination", async () => {
    // Real seeded pair >8km apart, which estimateByDistance resolves to
    // AUTO — the only mode with a seeded fare rule (DATA_STRATEGY.md §5).
    const farRoom = await prisma.roomOption.findFirstOrThrow({
      where: { place: { slug: "dev-pg-kalamassery-1" } },
    });
    const farDestination = await prisma.destination.findFirstOrThrow({
      where: { slug: "vyttila-mobility-hub" },
    });

    const { id: guestSessionId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Commute line plan",
        purpose: "JOB_RELOCATION",
        destinationId: farDestination.id,
        startDate: "2026-11-01",
        endDate: "2026-12-01", // 30 days
        requirements: emptyTripRequirements(),
      },
    );
    await addPlanItem(plan.id, { kind: "guest", guestSessionId }, {
      kind: "ACCOMMODATION",
      roomOptionId: farRoom.id,
    });

    const result = await computeBudgetForPlan(plan.id, { kind: "guest", guestSessionId });
    expect(result.byCategory.TRANSPORT).toBeGreaterThan(0n);
  });

  it("does not add a commute line when the room is walkable (no fare data needed or applicable)", async () => {
    const nearRoom = await prisma.roomOption.findFirstOrThrow({
      where: { place: { slug: "dev-pg-kakkanad-3" } }, // ~317m from Infopark Phase 1
    });
    const nearDestination = await prisma.destination.findFirstOrThrow({
      where: { slug: "infopark-phase-1-kochi" },
    });

    const { id: guestSessionId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Walkable plan",
        purpose: "JOB_RELOCATION",
        destinationId: nearDestination.id,
        startDate: "2026-11-01",
        endDate: "2026-12-01",
        requirements: emptyTripRequirements(),
      },
    );
    await addPlanItem(plan.id, { kind: "guest", guestSessionId }, {
      kind: "ACCOMMODATION",
      roomOptionId: nearRoom.id,
    });

    const result = await computeBudgetForPlan(plan.id, { kind: "guest", guestSessionId });
    expect(result.byCategory.TRANSPORT ?? 0n).toBe(0n);
  });

  it("rejects computing a budget for a plan the viewer doesn't own", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const { id: otherGuestId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Private plan",
        purpose: "TRIP",
        destinationId,
        startDate: "2026-11-01",
        endDate: "2026-11-05",
        requirements: emptyTripRequirements(),
      },
    );

    await expect(computeBudgetForPlan(plan.id, { kind: "guest", guestSessionId: otherGuestId })).rejects.toThrow(
      ForbiddenError,
    );
  });
});
