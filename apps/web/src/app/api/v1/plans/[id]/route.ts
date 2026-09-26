import { NextRequest } from "next/server";
import { resolveViewer } from "@/modules/auth/index.js";
import { getPlan } from "@/modules/plans/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { jsonResponse } from "@/lib/json.js";
import { applyGuestCookie } from "@/lib/cookies.js";

/** GET /api/v1/plans/:id — API_SPEC.md §5. Owner, or read-only via ?share=token. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveViewer(req);
  const shareToken = req.nextUrl.searchParams.get("share") ?? undefined;

  try {
    const plan = await getPlan(params.id, resolved.viewer, shareToken);
    if (!plan) {
      return jsonResponse(
        { type: "https://livo.app/errors/not-found", title: "Plan not found", status: 404, code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return applyGuestCookie(jsonResponse(plan), resolved);
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
