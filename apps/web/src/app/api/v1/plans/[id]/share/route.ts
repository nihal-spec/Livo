import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveViewer } from "@/modules/auth/index.js";
import { setPlanSharing } from "@/modules/plans/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { jsonResponse } from "@/lib/json.js";
import { applyGuestCookie } from "@/lib/cookies.js";

const ShareBody = z.object({ enabled: z.boolean() });

/** POST /api/v1/plans/:id/share — API_SPEC.md §5. Owner only. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveViewer(req);
  const body = await req.json().catch(() => null);
  const parsed = ShareBody.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { type: "https://livo.app/errors/validation", title: "Invalid request", status: 422, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const shareToken = await setPlanSharing(params.id, resolved.viewer, parsed.data.enabled);
    return applyGuestCookie(jsonResponse({ shareUrl: shareToken ? `/plan/${params.id}?share=${shareToken}` : null }), resolved);
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
