import { NextRequest } from "next/server";
import { z } from "zod";
import { OptimisticLockError, updatePlace } from "@/modules/admin-places/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { resolveAdminActor } from "@/lib/adminAuth.js";
import { jsonResponse } from "@/lib/json.js";

const UpdatePlaceBody = z.object({
  version: z.number().int(),
  name: z.string().min(1).max(200).optional(),
  addressLine: z.string().min(1).optional(),
  landmark: z.string().optional(),
  phoneE164: z.string().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

/** PATCH /api/v1/admin/places/:id — ADMIN_SPEC.md §3. Permission: places:update. Optimistic-locked. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const actor = resolveAdminActor(req);
  if (!actor) {
    return jsonResponse(
      { type: "https://livo.app/errors/unauthenticated", title: "Unauthenticated", status: 401, code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = UpdatePlaceBody.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { type: "https://livo.app/errors/validation", title: "Invalid request", status: 422, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const { version, ...patch } = parsed.data;
    const updated = await updatePlace(actor, params.id, version, patch);
    return jsonResponse(updated);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return jsonResponse(
        { type: "https://livo.app/errors/forbidden", title: "Forbidden", status: 403, code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    if (err instanceof OptimisticLockError) {
      return jsonResponse(
        { type: "https://livo.app/errors/conflict", title: err.message, status: 409, code: "CONFLICT" },
        { status: 409 },
      );
    }
    throw err;
  }
}
