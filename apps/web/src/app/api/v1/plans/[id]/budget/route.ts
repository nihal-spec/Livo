import { NextRequest } from "next/server";
import { resolveViewer } from "@/modules/auth/index.js";
import { computeBudgetForPlan } from "@/modules/budget/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { jsonResponse } from "@/lib/json.js";
import { applyGuestCookie } from "@/lib/cookies.js";

/** GET /api/v1/plans/:id/budget — API_SPEC.md §6. Owner only. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveViewer(req);
  try {
    const result = await computeBudgetForPlan(params.id, resolved.viewer);
    return applyGuestCookie(jsonResponse(result), resolved);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return jsonResponse(
        { type: "https://livo.app/errors/forbidden", title: "Forbidden", status: 403, code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    throw err;
  }
}
