import { NextRequest } from "next/server";
import { searchAccommodation } from "@/modules/search/index.js";
import { parseAccommodationSearchParams } from "@/modules/search/query.js";
import { jsonResponse } from "@/lib/json.js";

/**
 * GET /api/v1/search/accommodation — API_SPEC.md §2. Public, no auth
 * required (guest-first). Every filter is parsed and clamped by the shared
 * Zod schema before it reaches the search service.
 */
export async function GET(req: NextRequest) {
  const parsed = parseAccommodationSearchParams(Object.fromEntries(req.nextUrl.searchParams.entries()));
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
