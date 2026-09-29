"use server";

import { redirect } from "next/navigation";
import { PlanPurpose } from "@livo/schemas";
import { AiNotConfiguredError, extractTripRequirements } from "@/modules/ai/extractTripRequirements.js";
import { resolveDestinationByText } from "@/modules/ai/resolveDestination.js";
import { buildSearchParams } from "@/modules/ai/buildSearchParams.js";
import { resolveViewerForAction } from "@/modules/auth/index.js";
import { createPlan } from "@/modules/plans/index.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * AI intake (AI_ARCHITECTURE.md §4): free text -> structured requirements
 * -> a plan (so it joins the same wizard as the landing form) -> the
 * ordinary, deterministic search for that plan's stay. The redirect()
 * call sits outside the try/catch — Next's redirect works by throwing,
 * and a successful redirect must not be caught here as an error.
 */
export async function intakeAction(formData: FormData): Promise<void> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    redirect(`/intake?error=${encodeURIComponent("Tell us a bit about your trip first.")}`);
  }

  let target: string;
  try {
    const requirements = await extractTripRequirements(text);
    const destination = await resolveDestinationByText(requirements.destinationText);

    if (!destination) {
      target = `/intake?error=${encodeURIComponent(
        "We couldn't tell which destination you meant — try naming the office, hospital or college directly.",
      )}`;
    } else {
      const start = requirements.startDate ? new Date(requirements.startDate) : new Date(Date.now() + 14 * 86_400_000);
      const end = requirements.endDate
        ? new Date(requirements.endDate)
        : new Date(start.getTime() + (requirements.durationDays ?? 90) * 86_400_000);
      const monthlyBudget =
        requirements.budget?.period === "MONTH" ? BigInt(requirements.budget.amountInr) * 100n : null;
      const purpose = PlanPurpose.safeParse(requirements.purpose).success
        ? (requirements.purpose as PlanPurpose)
        : "JOB_RELOCATION";

      const viewer = await resolveViewerForAction();
      const plan = await createPlan(viewer, {
        title: `Stay near ${destination.name}`,
        purpose,
        destinationId: destination.id,
        startDate: isoDate(start),
        endDate: isoDate(end > start ? end : new Date(start.getTime() + 90 * 86_400_000)),
        people: requirements.people,
        requirements,
        budgetCapPaise: monthlyBudget,
        monthlyIncomePaise: requirements.monthlyIncomeInr != null ? BigInt(requirements.monthlyIncomeInr) * 100n : null,
        cashOnHandPaise: requirements.cashOnHandInr != null ? BigInt(requirements.cashOnHandInr) * 100n : null,
      });

      const params = buildSearchParams(requirements, destination.id);
      params.set("planId", plan.id);
      const note =
        requirements.missing.length > 0
          ? ` We couldn't tell your ${requirements.missing.join(", ")} — you can refine the filters below or edit the plan.`
          : "";
      params.set("aiNote", `We started a plan near ${destination.name} from what you told us.${note}`);
      target = `/search?${params.toString()}`;
    }
  } catch (err) {
    target =
      err instanceof AiNotConfiguredError
        ? `/intake?error=${encodeURIComponent("AI intake isn't available right now — try the regular form instead.")}`
        : `/intake?error=${encodeURIComponent("Couldn't understand that just now — try rephrasing, or use the regular form.")}`;
  }

  redirect(target);
}
