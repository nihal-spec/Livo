import { NextRequest } from "next/server";
import { z } from "zod";
import { InvalidTransitionError, transitionPlaceStatus } from "@/modules/admin-places/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { resolveAdminActor } from "@/lib/adminAuth.js";
import { jsonResponse } from "@/lib/json.js";

const Body = z.object({ status: z.enum(["PENDING_REVIEW", "PUBLISHED", "REJECTED", "UNVERIFIABLE", "CLOSED"]) });

/** POST /api/v1/admin/places/:id/publish — ADMIN_SPEC.md §3-4 (status workflow). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = resolveAdminActor(req);
  if (!actor) {
    return jsonResponse(
      { type: "https://livo.app/errors/unauthenticated", title: "Unauthenticated", status: 401, code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { type: "https://livo.app/errors/validation", title: "Invalid request", status: 422, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const updated = await transitionPlaceStatus(actor, params.id, parsed.data.status);
    return jsonResponse(updated);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return jsonResponse(
        { type: "https://livo.app/errors/forbidden", title: "Forbidden", status: 403, code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    if (err instanceof InvalidTransitionError) {
      return jsonResponse(
        { type: "https://livo.app/errors/conflict", title: err.message, status: 409, code: "INVALID_TRANSITION" },
        { status: 409 },
      );
    }
    throw err;
  }
}
