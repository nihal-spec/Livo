"use server";

import { redirect } from "next/navigation";
import { emptyTripRequirements, PlanPurpose } from "@livo/schemas";
import { resolveViewerForAction } from "@/modules/auth/index.js";
import { prisma } from "@livo/db";
import { addPlanItem, createPlan, setPlanItem, setPlanSharing, updatePlanDetails } from "@/modules/plans/index.js";

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseRupeesToPaise(raw: FormDataEntryValue | null): bigint | null {
  const n = Number(String(raw ?? "").replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 100)) : null;
}

function defaultDates(): { start: string; end: string } {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 90);
  return { start: dateOnly(start), end: dateOnly(end) };
}

/**
 * Step 0 of the wizard (landing form): where, when, how long, what budget.
 * Creates the one plan every later step (stay, food, budget) fills in.
 */
export async function startPlanAction(formData: FormData): Promise<void> {
  const destinationId = String(formData.get("destinationId") ?? "");
  if (!destinationId) redirect("/?error=destination");

  const destination = await prisma.destination.findUnique({ where: { id: destinationId } });
  if (!destination) redirect("/?error=destination");

  const purposeRaw = formData.get("purpose");
  const purpose = (PlanPurpose.safeParse(purposeRaw).success ? purposeRaw : "JOB_RELOCATION") as PlanPurpose;

  const startRaw = String(formData.get("startDate") ?? "");
  const start = /^\d{4}-\d{2}-\d{2}$/.test(startRaw) ? new Date(startRaw) : new Date(defaultDates().start);
  const months = Math.min(Math.max(Number(formData.get("months") ?? 3) || 3, 1), 12);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);

  const viewer = await resolveViewerForAction();
  const plan = await createPlan(viewer, {
    title: `Stay near ${destination.name}`,
    purpose,
    destinationId,
    startDate: dateOnly(start),
    endDate: dateOnly(end),
    requirements: emptyTripRequirements(),
    budgetCapPaise: parseRupeesToPaise(formData.get("budget")),
    monthlyIncomePaise: parseRupeesToPaise(formData.get("income")),
  });
  redirect(`/plan/${plan.id}`);
}

/**
 * "Add to plan" from a search result. Inside the wizard (a planId is
 * present) it sets the plan's stay, replacing any earlier pick; browsing
 * without a plan starts a new one with default dates the user can edit.
 */
export async function addAccommodationToNewPlan(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const roomOptionId = String(formData.get("roomOptionId") ?? "");
  if (!roomOptionId) throw new Error("Missing roomOptionId");
  const viewer = await resolveViewerForAction();

  if (planId) {
    await setPlanItem(planId, viewer, { kind: "ACCOMMODATION", roomOptionId });
    redirect(`/plan/${planId}`);
  }

  const destinationId = String(formData.get("destinationId") ?? "");
  const destinationName = String(formData.get("destinationName") ?? "your destination");
  if (!destinationId) throw new Error("Missing destinationId");
  const { start, end } = defaultDates();
  const plan = await createPlan(viewer, {
    title: `Stay near ${destinationName}`,
    purpose: "JOB_RELOCATION",
    destinationId,
    startDate: start,
    endDate: end,
    requirements: emptyTripRequirements(),
  });
  await addPlanItem(plan.id, viewer, { kind: "ACCOMMODATION", roomOptionId });
  redirect(`/plan/${plan.id}`);
}

/** Parity with addAccommodationToNewPlan, for a food-plan result. */
export async function addFoodToNewPlan(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const foodPlanId = String(formData.get("foodPlanId") ?? "");
  if (!foodPlanId) throw new Error("Missing foodPlanId");
  const viewer = await resolveViewerForAction();

  if (planId) {
    await setPlanItem(planId, viewer, { kind: "FOOD", foodPlanId });
    redirect(`/plan/${planId}`);
  }

  const destinationId = String(formData.get("destinationId") ?? "");
  const destinationName = String(formData.get("destinationName") ?? "your destination");
  if (!destinationId) throw new Error("Missing destinationId");
  const { start, end } = defaultDates();
  const plan = await createPlan(viewer, {
    title: `Stay near ${destinationName}`,
    purpose: "JOB_RELOCATION",
    destinationId,
    startDate: start,
    endDate: end,
    requirements: emptyTripRequirements(),
  });
  await addPlanItem(plan.id, viewer, { kind: "FOOD", foodPlanId });
  redirect(`/plan/${plan.id}`);
}

export async function updatePlanDetailsAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const viewer = await resolveViewerForAction();

  let target = `/plan/${planId}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate <= startDate) {
    target = `/plan/${planId}?detailsError=${encodeURIComponent("The end date must be after the start date.")}`;
  } else {
    await updatePlanDetails(planId, viewer, {
      startDate,
      endDate,
      budgetCapPaise: parseRupeesToPaise(formData.get("budget")),
      monthlyIncomePaise: parseRupeesToPaise(formData.get("income")),
      cashOnHandPaise: parseRupeesToPaise(formData.get("cash")),
    });
  }
  redirect(target);
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const { removePlanItem } = await import("@/modules/plans/index.js");
  const planId = String(formData.get("planId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const viewer = await resolveViewerForAction();
  await removePlanItem(planId, itemId, viewer);
  redirect(`/plan/${planId}`);
}

export async function toggleShareAction(formData: FormData): Promise<void> {
  const planId = String(formData.get("planId") ?? "");
  const enabled = formData.get("enabled") === "true";
  const viewer = await resolveViewerForAction();
  await setPlanSharing(planId, viewer, enabled);
  redirect(`/plan/${planId}`);
}

/**
 * Runs a what-if lever (ARCHITECTURE.md §6) and redirects back to the plan
 * with the resulting scenario id in the URL, so the plan page can render
 * its ScenarioDelta card. Errors (no accommodation item yet, unsupported
 * lever) redirect back with an error message instead of a scenario id —
 * they're expected user-facing outcomes, not server failures.
 */
export async function runScenarioAction(formData: FormData): Promise<void> {
  const { runScenario } = await import("@/modules/scenarios/index.js");
  const planId = String(formData.get("planId") ?? "");
  const lever = String(formData.get("lever") ?? "");
  const viewer = await resolveViewerForAction();

  // next/navigation's redirect() works by throwing internally, so the
  // actual redirect call must sit outside this try/catch — otherwise a
  // *successful* run's own redirect would be caught here as if it were an
  // error from runScenario().
  let target: string;
  try {
    const result = await runScenario(planId, viewer, { lever: lever as never });
    target = `/plan/${planId}?scenario=${result.scenarioId}`;
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    target = `/plan/${planId}?scenarioError=${encodeURIComponent(err.message)}`;
  }
  redirect(target);
}
