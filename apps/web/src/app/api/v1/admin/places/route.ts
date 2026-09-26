import { NextRequest } from "next/server";
import { z } from "zod";
import { AccommodationKind, GenderPolicy } from "@livo/schemas";
import { createPlace, listPlaces } from "@/modules/admin-places/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { resolveAdminActor } from "@/lib/adminAuth.js";
import { jsonResponse } from "@/lib/json.js";

/** GET /api/v1/admin/places — ADMIN_SPEC.md §3. Permission: places:read. */
export async function GET(req: NextRequest) {
  const actor = resolveAdminActor(req);
  if (!actor) {
    return jsonResponse(
      { type: "https://livo.app/errors/unauthenticated", title: "Unauthenticated", status: 401, code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const sp = req.nextUrl.searchParams;
  try {
    const result = await listPlaces(actor, {
      status: sp.get("status") ?? undefined,
      category: sp.get("category") ?? undefined,
      q: sp.get("q") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return jsonResponse(result);
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

const CreatePlaceBody = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
  regionId: z.string(),
  addressLine: z.string().min(1),
  landmark: z.string().optional(),
  phoneE164: z.string().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }),
  accommodation: z.object({
    kind: AccommodationKind,
    genderPolicy: GenderPolicy,
    foodIncluded: z.boolean().optional(),
  }),
});

/** POST /api/v1/admin/places — ADMIN_SPEC.md §3. Permission: places:create. */
export async function POST(req: NextRequest) {
  const actor = resolveAdminActor(req);
  if (!actor) {
    return jsonResponse(
      { type: "https://livo.app/errors/unauthenticated", title: "Unauthenticated", status: 401, code: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = CreatePlaceBody.safeParse(body);
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
    const place = await createPlace(actor, parsed.data);
    return jsonResponse(place, { status: 201 });
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
