"use server";

import { redirect } from "next/navigation";
import { AiNotConfiguredError, extractTripRequirements } from "@/modules/ai/extractTripRequirements.js";
import { resolveDestinationByText } from "@/modules/ai/resolveDestination.js";
import { buildSearchParams } from "@/modules/ai/buildSearchParams.js";

/**
 * AI intake (AI_ARCHITECTURE.md §4): free text -> structured requirements
 * -> the ordinary, deterministic search. The redirect() call sits outside
 * the try/catch for the same reason as runScenarioAction — Next's
 * redirect works by throwing, and a successful redirect must not be
 * caught here as if it were an extraction error.
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
      const missing = [...requirements.missing, "destination"].join(", ");
      target = `/intake?error=${encodeURIComponent(
        `We couldn't tell which destination you meant — try naming it directly, or pick one below. (Also unclear: ${missing})`,
      )}`;
    } else {
      const params = buildSearchParams(requirements, destination.id);
      const note =
        requirements.missing.length > 0
          ? ` We couldn't tell your ${requirements.missing.join(", ")} — you can refine the filters below.`
          : "";
      params.set("aiNote", `Matched "${destination.name}" from what you told us.${note}`);
      target = `/search?${params.toString()}`;
    }
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      target = `/intake?error=${encodeURIComponent("AI intake isn't available right now — try the search filters instead.")}`;
    } else {
      target = `/intake?error=${encodeURIComponent("Couldn't understand that just now — try rephrasing, or use search filters instead.")}`;
    }
  }

  redirect(target);
}
