import { prisma } from "@livo/db";
import { getDistanceToDestination } from "@livo/db/geo";
import { calculateBudget } from "@livo/budget-engine";
import { BudgetResult, type ScenarioLever, type ScenarioOverrides } from "@livo/schemas";
import { ForbiddenError } from "@/modules/rbac/index.js";
import type { Viewer } from "@/modules/auth/index.js";
import { searchAccommodation } from "@/modules/search/index.js";
import { normalizeToMonthlyPaise } from "@/modules/search/fare.js";
import { buildBudgetInputForPlan, computeBudgetForPlan } from "@/modules/budget/index.js";
import { toPlainJson } from "@/lib/json.js";

/**
 * What-if engine (ARCHITECTURE.md §6). Candidate levers (CHEAPER, CLOSER,
 * PRIVATE_ROOM, FOOD_INCLUDED) re-run search with derived constraints and
 * apply a deterministic pick rule — never an AI guess. PUBLIC_TRANSPORT is
 * schema-allowed but not implemented yet (no bus/metro fare data — see
 * DATA_STRATEGY.md §5); it fails clearly rather than silently no-op'ing.
 */

const DEFAULT_SCENARIO_RADIUS_KM = 15;

export interface ScenarioRunResult {
  scenarioId: string;
  lever: ScenarioLever;
  found: boolean;
  note: string;
  baseBudget: BudgetResult;
  scenarioBudget: BudgetResult;
  alternative: { placeId: string; placeSlug: string; placeName: string; roomOptionId: string } | null;
  deltaMonthlyPaise: bigint;
  deltaUpfrontPaise: bigint;
  deltaTripTotalPaise: bigint;
}

export class NoAccommodationItemError extends Error {
  constructor() {
    super("This plan has no accommodation item yet — add one before running a what-if scenario.");
    this.name = "NoAccommodationItemError";
  }
}

export class UnsupportedLeverError extends Error {
  constructor(lever: string) {
    super(`The "${lever}" lever isn't available yet.`);
    this.name = "UnsupportedLeverError";
  }
}

async function getCurrentAccommodation(planId: string) {
  const item = await prisma.planItem.findFirst({ where: { planId, kind: "ACCOMMODATION" } });
  if (!item?.roomOptionId) return null;
  const room = await prisma.roomOption.findUnique({ where: { id: item.roomOptionId }, include: { place: true } });
  return room ?? null;
}

function ownsPlan(
  plan: { ownerUserId: string | null; guestSessionId: string | null },
  viewer: Viewer,
): boolean {
  return (
    (viewer.kind === "user" && plan.ownerUserId === viewer.userId) ||
    (viewer.kind === "guest" && plan.guestSessionId === viewer.guestSessionId)
  );
}

export async function runScenario(
  planId: string,
  viewer: Viewer,
  overrides: ScenarioOverrides,
): Promise<ScenarioRunResult> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  if (!ownsPlan(plan, viewer)) throw new ForbiddenError("plans:read (not the owner of this plan)");

  const lever = overrides.lever;
  if (!lever) throw new Error("runScenario requires overrides.lever");
  if (lever === "PUBLIC_TRANSPORT") throw new UnsupportedLeverError(lever);

  const currentRoom = await getCurrentAccommodation(planId);
  if (!currentRoom) throw new NoAccommodationItemError();

  const baseBudget = await computeBudgetForPlan(planId, viewer);
  const currentDistanceM = await getDistanceToDestination(currentRoom.placeId, plan.destinationId);
  // Compare rent-to-rent (both normalized to a monthly-equivalent), not
  // against search's bundled monthlyTotalPaise (rent+food+commute) — the
  // plan's own persisted budget only includes food/commute if the user
  // actually added those items, so bundling them here would compare two
  // different things.
  const currentMonthlyRentPaise = normalizeToMonthlyPaise(currentRoom.pricePaise, currentRoom.priceBasis);

  const searchResult = await searchAccommodation({
    destinationId: plan.destinationId,
    people: plan.people,
    kinds: [],
    occupancy: lever === "PRIVATE_ROOM" ? "SINGLE" : "ANY",
    genderPolicy: "ANY",
    amenities: [],
    commuteMode: "ANY",
    radiusKm: DEFAULT_SCENARIO_RADIUS_KM,
    verifiedOnly: false,
    sort: lever === "CLOSER" ? "closest" : "total_cost",
    priority: "balanced",
    limit: 20,
    foodIncluded: lever === "FOOD_INCLUDED" ? true : undefined,
  });

  const candidate = pickCandidate(lever, searchResult.items, {
    currentPlaceId: currentRoom.placeId,
    currentMonthlyRentPaise,
    currentDistanceM,
  });

  const scenarioName = `${lever}_${Date.now()}`;
  let scenarioBudget = baseBudget;
  let alternative: ScenarioRunResult["alternative"] = null;
  let note: string;
  const found = candidate != null;

  if (candidate) {
    const scenarioInput = await buildBudgetInputForPlan(planId, { overrideRoomOptionId: candidate.room.id });
    scenarioBudget = calculateBudget(scenarioInput, { assumptionsVersion: "dev-unversioned" });
    alternative = {
      placeId: candidate.placeId,
      placeSlug: candidate.slug,
      placeName: candidate.name,
      roomOptionId: candidate.room.id,
    };
    note = noteFor(lever, true);
  } else {
    note = noteFor(lever, false);
  }

  const scenario = await prisma.scenario.create({
    data: { planId, name: scenarioName, overrides: overrides as never },
  });

  const result: ScenarioRunResult = {
    scenarioId: scenario.id,
    lever,
    found,
    note,
    baseBudget,
    scenarioBudget,
    alternative,
    deltaMonthlyPaise: scenarioBudget.recurring.monthlyPaise - baseBudget.recurring.monthlyPaise,
    deltaUpfrontPaise: scenarioBudget.setupPaise - baseBudget.setupPaise,
    deltaTripTotalPaise: scenarioBudget.tripTotalPaise - baseBudget.tripTotalPaise,
  };

  // Persisted via BudgetSnapshot (the schema's designated home for a
  // scenario's computed result, DATABASE_DESIGN.md §3) so the plan page
  // can render this exact result after the Server Action's redirect,
  // without recomputing (which could drift if data changed) or
  // duplicating the Scenario row.
  await prisma.budgetSnapshot.create({
    data: {
      planId,
      scenarioId: scenario.id,
      engineVersion: scenarioBudget.engineVersion,
      assumptionsVersion: scenarioBudget.assumptionsVersion,
      inputsHash: "n/a", // MVP: not yet used for cache invalidation
      result: toPlainJson(result) as never,
    },
  });

  return result;
}

/** Reads back a scenario's persisted result (see the BudgetSnapshot write above). */
export async function getScenarioResult(scenarioId: string): Promise<ScenarioRunResult | null> {
  const snapshot = await prisma.budgetSnapshot.findFirst({
    where: { scenarioId },
    orderBy: { createdAt: "desc" },
  });
  if (!snapshot) return null;

  const raw = snapshot.result as Record<string, unknown>;
  return {
    scenarioId,
    lever: raw.lever as ScenarioLever,
    found: raw.found as boolean,
    note: raw.note as string,
    baseBudget: BudgetResult.parse(raw.baseBudget),
    scenarioBudget: BudgetResult.parse(raw.scenarioBudget),
    alternative: raw.alternative as ScenarioRunResult["alternative"],
    deltaMonthlyPaise: BigInt(raw.deltaMonthlyPaise as string),
    deltaUpfrontPaise: BigInt(raw.deltaUpfrontPaise as string),
    deltaTripTotalPaise: BigInt(raw.deltaTripTotalPaise as string),
  };
}

interface PickContext {
  currentPlaceId: string;
  currentMonthlyRentPaise: bigint;
  currentDistanceM: number | null;
}

function pickCandidate(
  lever: ScenarioLever,
  items: Awaited<ReturnType<typeof searchAccommodation>>["items"],
  ctx: PickContext,
) {
  const others = items.filter((i) => i.placeId !== ctx.currentPlaceId);

  switch (lever) {
    case "CHEAPER":
      return (
        others.find((i) => {
          const rent = normalizeToMonthlyPaise(i.room.pricePaise, i.room.priceBasis);
          return rent < (ctx.currentMonthlyRentPaise * 9n) / 10n;
        }) ?? null
      );
    case "CLOSER":
      return ctx.currentDistanceM != null
        ? (others.find((i) => (i.commute?.distanceM ?? Infinity) < ctx.currentDistanceM! - 200) ?? null)
        : null;
    case "PRIVATE_ROOM":
      return others.find((i) => i.room.occupancy === "SINGLE") ?? null;
    case "FOOD_INCLUDED":
      return others.find((i) => i.foodIncluded === true) ?? null;
    default:
      return null;
  }
}

function noteFor(lever: ScenarioLever, found: boolean): string {
  // Two full sentences per lever rather than interpolating one noun phrase
  // into both "Found ..." and "No ... found" — the same phrase reads
  // correctly in the first and ungrammatically in the second ("No a place
  // ... found").
  const found_: Record<ScenarioLever, string> = {
    CHEAPER: "Found a place at least 10% cheaper nearby.",
    CLOSER: "Found a place noticeably closer to your destination.",
    FOOD_INCLUDED: "Found a place with food included.",
    PRIVATE_ROOM: "Found a private room.",
    PUBLIC_TRANSPORT: "",
  };
  const notFound: Record<ScenarioLever, string> = {
    CHEAPER: `No place at least 10% cheaper found within ${DEFAULT_SCENARIO_RADIUS_KM} km — try widening your search.`,
    CLOSER: `No noticeably closer place found within ${DEFAULT_SCENARIO_RADIUS_KM} km.`,
    FOOD_INCLUDED: `No place with food included found within ${DEFAULT_SCENARIO_RADIUS_KM} km.`,
    PRIVATE_ROOM: `No private room found within ${DEFAULT_SCENARIO_RADIUS_KM} km.`,
    PUBLIC_TRANSPORT: "",
  };
  return found ? found_[lever] : notFound[lever];
}
