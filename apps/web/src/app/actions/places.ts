"use server";

import { redirect } from "next/navigation";
import { resolveViewerForAction } from "@/modules/auth/index.js";
import { RateLimitedError, REPORT_REASONS, submitReport } from "@/modules/places/index.js";

/**
 * Report-wrong-info (API_SPEC.md §3, MASTER_PLAN.md §39). A plain Server
 * Action + redirect works fine here with no client JS required — unlike
 * contact reveal (ContactReveal.tsx), there's no sensitive data to keep
 * out of the URL, so this doesn't need the fetch-based client pattern.
 */
export async function submitReportAction(formData: FormData): Promise<void> {
  const placeSlug = String(formData.get("placeSlug") ?? "");
  const placeId = String(formData.get("placeId") ?? "");
  const reasonRaw = formData.get("reason");
  const reason = (REPORT_REASONS as readonly string[]).includes(String(reasonRaw))
    ? (reasonRaw as (typeof REPORT_REASONS)[number])
    : "OTHER";
  const detail = String(formData.get("detail") ?? "").slice(0, 1000) || undefined;

  const viewer = await resolveViewerForAction();

  let target = `/p/${placeSlug}?reported=1`;
  try {
    await submitReport(placeId, viewer, { reason, detail });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      target = `/p/${placeSlug}?reportError=${encodeURIComponent(err.message)}`;
    } else if (err instanceof Error) {
      target = `/p/${placeSlug}?reportError=${encodeURIComponent(err.message)}`;
    } else {
      throw err;
    }
  }
  redirect(target);
}
