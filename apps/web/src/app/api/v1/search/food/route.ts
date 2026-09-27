import { NextRequest } from "next/server";
import { searchFood } from "@/modules/search/food.js";
import { parseFoodSearchParams } from "@/modules/search/foodQuery.js";
import { jsonResponse } from "@/lib/json.js";

/**
 * GET /api/v1/search/food — parity with /api/v1/search/accommodation.
 * Public, no auth required (guest-first).
 */
export async function GET(req: NextRequest) {
  const parsed = parseFoodSearchParams(Object.fromEntries(req.nextUrl.searchParams.entries()));
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
    const result = await searchFood(parsed.data);
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
