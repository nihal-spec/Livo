import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveViewer } from "@/modules/auth/index.js";
import { addPlanItem } from "@/modules/plans/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { jsonResponse } from "@/lib/json.js";
import { applyGuestCookie } from "@/lib/cookies.js";

const AddItemBody = z.object({
  kind: z.enum(["ACCOMMODATION", "FOOD", "TRANSPORT", "CUSTOM_COST"]),
  placeId: z.string().optional(),
  roomOptionId: z.string().optional(),
  foodPlanId: z.string().optional(),
  custom: z
    .object({
      label: z.string().min(1).max(200),
      amountPaise: z.string().regex(/^\d+$/),
      frequency: z.enum(["ONE_TIME", "DAILY", "WEEKLY", "MONTHLY", "PER_NIGHT", "PER_MEAL"]),
      category: z.string(),
    })
    .optional(),
});

/** POST /api/v1/plans/:id/items — API_SPEC.md §5. Owner only. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveViewer(req);
  const body = await req.json().catch(() => null);
  const parsed = AddItemBody.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { type: "https://livo.app/errors/validation", title: "Invalid request", status: 422, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const item = await addPlanItem(params.id, resolved.viewer, parsed.data);
    return applyGuestCookie(jsonResponse(item, { status: 201 }), resolved);
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
