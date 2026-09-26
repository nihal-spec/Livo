import { NextRequest } from "next/server";
import { AccommodationSearchQuery } from "@livo/schemas";
import { searchAccommodation } from "@/modules/search/index.js";
import { jsonResponse } from "@/lib/json.js";

/**
 * GET /api/v1/search/accommodation — API_SPEC.md §2. Public, no auth
 * required (guest-first). Every filter is parsed and clamped by the shared
 * Zod schema before it reaches the search service.
 */
export async function GET(req: NextRequest) {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());

  // Array/boolean/number query params arrive as strings; coerce the ones
  // the schema expects to be richer types before validating.
  const candidate: Record<string, unknown> = { ...raw };
  for (const key of ["kinds", "amenities"] as const) {
    if (typeof raw[key] === "string") candidate[key] = raw[key].split(",").filter(Boolean);
  }
  for (const key of ["ac", "privateBath", "foodIncluded", "verifiedOnly"] as const) {
    if (raw[key] != null) candidate[key] = raw[key] === "true";
  }
  for (const key of ["people", "priceMin", "priceMax", "maxCommuteMin", "limit"] as const) {
    if (raw[key] != null) candidate[key] = Number(raw[key]);
  }
  if (raw.radiusKm != null) candidate.radiusKm = Number(raw.radiusKm);

  const parsed = AccommodationSearchQuery.safeParse(candidate);
  if (!parsed.success) {
    return jsonResponse(
      {
        type: "https://livo.app/errors/validation",
        title: "Invalid request",
        status: 422,
        code: "VALIDATION_FAILED",
        errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 },
    );
  }

  try {
    const result = await searchAccommodation(parsed.data);
    return jsonResponse(result);
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === "NOT_FOUND") {
      return jsonResponse(
        { type: "https://livo.app/errors/not-found", title: "Unknown destination", status: 404, code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    throw err;
  }
}
