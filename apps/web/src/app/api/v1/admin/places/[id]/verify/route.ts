import { NextRequest } from "next/server";
import { z } from "zod";
import { verifyFact } from "@/modules/admin-places/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { resolveAdminActor } from "@/lib/adminAuth.js";
import { jsonResponse } from "@/lib/json.js";

const Body = z.object({
  factKey: z.string().min(1),
  method: z.enum(["PHONE_CALL", "SITE_VISIT", "PARTNER_PORTAL", "DOCUMENT", "API_SYNC", "USER_REPORT"]),
  note: z.string().max(1000).optional(),
});

/** POST /api/v1/admin/places/:id/verify — ADMIN_SPEC.md §4 (verification loop). */
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
    const fact = await verifyFact(actor, params.id, parsed.data);
    return jsonResponse(fact, { status: 201 });
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
