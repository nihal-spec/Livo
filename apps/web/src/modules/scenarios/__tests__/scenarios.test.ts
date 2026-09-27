import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { emptyTripRequirements } from "@livo/schemas";
import { createGuestSession } from "@/modules/auth/index.js";
import { createPlan, addPlanItem } from "@/modules/plans/index.js";
import { getScenarioResult, NoAccommodationItemError, runScenario, UnsupportedLeverError } from "../index.js";

describe("runScenario", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makePlanWithRoom(roomSlug: string, destSlug: string) {
    const room = await prisma.roomOption.findFirstOrThrow({ where: { place: { slug: roomSlug } } });
    const dest = await prisma.destination.findFirstOrThrow({ where: { slug: destSlug } });

    const { id: guestSessionId } = await createGuestSession();
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Scenario test plan",
        purpose: "JOB_RELOCATION",
        destinationId: dest.id,
        startDate: "2026-11-01",
        endDate: "2027-01-30",
        requirements: emptyTripRequirements(),
      },
    );
    await addPlanItem(plan.id, { kind: "guest", guestSessionId }, { kind: "ACCOMMODATION", roomOptionId: room.id });
    return { plan, viewer: { kind: "guest" as const, guestSessionId }, room };
  }

  it("CHEAPER finds a cheaper alternative and returns a negative monthly delta", async () => {
    // Infopark Comforts (₹9,500/mo) has cheaper PGs nearby in the dev fixtures.
    const { plan, viewer } = await makePlanWithRoom("dev-pg-kakkanad-3", "infopark-phase-1-kochi");

    const result = await runScenario(plan.id, viewer, { lever: "CHEAPER" });
    expect(result.found).toBe(true);
    expect(result.alternative).not.toBeNull();
    expect(result.deltaMonthlyPaise).toBeLessThan(0n);
    expect(result.scenarioBudget.recurring.monthlyPaise).toBeLessThan(result.baseBudget.recurring.monthlyPaise);
  });

  it("PRIVATE_ROOM finds a single-occupancy alternative", async () => {
    // Green Nest PG is a DOUBLE room; there's a SINGLE room nearby.
    const { plan, viewer } = await makePlanWithRoom("dev-pg-kakkanad-1", "infopark-phase-1-kochi");

    const result = await runScenario(plan.id, viewer, { lever: "PRIVATE_ROOM" });
    expect(result.found).toBe(true);
  });

  it("FOOD_INCLUDED finds an alternative with food included", async () => {
    // Infopark Comforts has foodIncluded=false; others nearby have it true.
    const { plan, viewer } = await makePlanWithRoom("dev-pg-kakkanad-3", "infopark-phase-1-kochi");

    const result = await runScenario(plan.id, viewer, { lever: "FOOD_INCLUDED" });
    expect(result.found).toBe(true);
  });

  it("returns found:false with an honest note when no better option exists", async () => {
    // The cheapest fixture in the whole dataset — nothing can be 10% cheaper.
    const { plan, viewer } = await makePlanWithRoom("dev-pg-kalamassery-1", "cusat-kalamassery");

    const result = await runScenario(plan.id, viewer, { lever: "CHEAPER" });
    expect(result.found).toBe(false);
    expect(result.alternative).toBeNull();
    expect(result.scenarioBudget).toEqual(result.baseBudget);
    expect(result.note).toMatch(/No .* found/);
    expect(result.note).not.toMatch(/No a /); // regression check for the "No a place... found" grammar bug
  });

  it("getScenarioResult round-trips the persisted result, bigints and all", async () => {
    const { plan, viewer } = await makePlanWithRoom("dev-pg-kakkanad-3", "infopark-phase-1-kochi");
    const original = await runScenario(plan.id, viewer, { lever: "CHEAPER" });

    const reloaded = await getScenarioResult(original.scenarioId);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.deltaMonthlyPaise).toBe(original.deltaMonthlyPaise);
    expect(typeof reloaded!.deltaMonthlyPaise).toBe("bigint");
    expect(reloaded!.scenarioBudget.tripTotalPaise).toBe(original.scenarioBudget.tripTotalPaise);
    expect(reloaded!.alternative?.placeId).toBe(original.alternative?.placeId);
    expect(reloaded!.found).toBe(true);
  });

  it("getScenarioResult returns null for an unknown scenario id", async () => {
    expect(await getScenarioResult("nonexistent_scenario_id")).toBeNull();
  });

  it("persists a Scenario row for every run, found or not", async () => {
    const { plan, viewer } = await makePlanWithRoom("dev-pg-kakkanad-3", "infopark-phase-1-kochi");
    const before = await prisma.scenario.count({ where: { planId: plan.id } });

    await runScenario(plan.id, viewer, { lever: "CLOSER" });

    const after = await prisma.scenario.count({ where: { planId: plan.id } });
    expect(after).toBe(before + 1);
  });

  it("throws UnsupportedLeverError for PUBLIC_TRANSPORT rather than silently no-op'ing", async () => {
    const { plan, viewer } = await makePlanWithRoom("dev-pg-kakkanad-3", "infopark-phase-1-kochi");
    await expect(runScenario(plan.id, viewer, { lever: "PUBLIC_TRANSPORT" })).rejects.toThrow(UnsupportedLeverError);
  });

  it("throws NoAccommodationItemError for a plan with no accommodation item", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const dest = await prisma.destination.findFirstOrThrow({ where: { slug: "infopark-phase-1-kochi" } });
    const plan = await createPlan(
      { kind: "guest", guestSessionId },
      {
        title: "Empty plan",
        purpose: "TRIP",
        destinationId: dest.id,
        startDate: "2026-11-01",
        endDate: "2026-11-05",
        requirements: emptyTripRequirements(),
      },
    );

    await expect(runScenario(plan.id, { kind: "guest", guestSessionId }, { lever: "CHEAPER" })).rejects.toThrow(
      NoAccommodationItemError,
    );
  });
});
