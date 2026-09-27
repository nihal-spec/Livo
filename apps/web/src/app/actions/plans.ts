"use server";

import { redirect } from "next/navigation";
import { emptyTripRequirements, PlanPurpose } from "@livo/schemas";
import { resolveViewerForAction } from "@/modules/auth/index.js";
import { addPlanItem, createPlan, setPlanSharing } from "@/modules/plans/index.js";

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * "Add to plan" from a search result (ListingCard). Creates a new guest
 * plan (or would append to an existing one, once the UI offers that
 * choice — MASTER_PLAN.md §39 lists that as V1) with a sensible default
 * date range, adds the chosen room as an accommodation item, and redirects
 * to the plan builder. Server Actions can set cookies before the redirect
 * (unlike a plain Server Component), which is why plan creation lives
 * here rather than being called straight from a page.
 */
export async function addAccommodationToNewPlan(formData: FormData): Promise<void> {
  const destinationId = String(formData.get("destinationId") ?? "");
  const roomOptionId = String(formData.get("roomOptionId") ?? "");
  const destinationName = String(formData.get("destinationName") ?? "your destination");
  if (!destinationId || !roomOptionId) throw new Error("Missing destinationId or roomOptionId");

  const purposeRaw = formData.get("purpose");
  const purpose = PlanPurpose.safeParse(purposeRaw).success ? (purposeRaw as string) : "JOB_RELOCATION";

  const viewer = await resolveViewerForAction();
  const start = new Date();
  start.setDate(start.getDate() + 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 90);

  const plan = await createPlan(viewer, {
    title: `Stay near ${destinationName}`,
    purpose: purpose as PlanPurpose,
    destinationId,
    startDate: dateOnly(start),
    endDate: dateOnly(end),
    requirements: emptyTripRequirements(),
  });

  await addPlanItem(plan.id, viewer, { kind: "ACCOMMODATION", roomOptionId });
  redirect(`/plan/${plan.id}`);
}

/** Parity with addAccommodationToNewPlan, for a food-plan result. */
export async function addFoodToNewPlan(formData: FormData): Promise<void> {
  const destinationId = String(formData.get("destinationId") ?? "");
  const foodPlanId = String(formData.get("foodPlanId") ?? "");
  const destinationName = String(formData.get("destinationName") ?? "your destination");
  if (!destinationId || !foodPlanId) throw new Error("Missing destinationId or foodPlanId");

  const purposeRaw = formData.get("purpose");
  const purpose = PlanPurpose.safeParse(purposeRaw).success ? (purposeRaw as string) : "JOB_RELOCATION";

  const viewer = await resolveViewerForAction();
  const start = new Date();
  start.setDate(start.getDate() + 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 90);

  const plan = await createPlan(viewer, {
    title: `Stay near ${destinationName}`,
    purpose: purpose as PlanPurpose,
    destinationId,
    startDate: dateOnly(start),
    endDate: dateOnly(end),
    requirements: emptyTripRequirements(),
  });

  await addPlanItem(plan.id, viewer, { kind: "FOOD", foodPlanId });
  redirect(`/plan/${plan.id}`);
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
