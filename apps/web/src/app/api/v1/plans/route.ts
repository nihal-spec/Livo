import { NextRequest } from "next/server";
import { z } from "zod";
import { PlanPurpose, TripRequirements, paiseSchema } from "@livo/schemas";
import { resolveViewer } from "@/modules/auth/index.js";
import { createPlan } from "@/modules/plans/index.js";
import { jsonResponse } from "@/lib/json.js";
import { applyGuestCookie } from "@/lib/cookies.js";

/**
 * POST /api/v1/plans — API_SPEC.md §5. Guest-first: creating a plan never
 * requires sign-in. The guest cookie is (re)issued here if the caller
 * didn't have one yet.
 */
const CreatePlanBody = z.object({
  title: z.string().min(1).max(200),
  purpose: PlanPurpose,
  destinationId: z.string(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  people: z.number().int().min(1).max(20).default(1),
  requirements: TripRequirements,
  monthlyIncomePaise: paiseSchema.nullable().optional(),
  budgetCapPaise: paiseSchema.nullable().optional(),
  cashOnHandPaise: paiseSchema.nullable().optional(),
});

export async function POST(req: NextRequest) {
  const resolved = await resolveViewer(req);
  const { viewer } = resolved;

  const body = await req.json().catch(() => null);
  const parsed = CreatePlanBody.safeParse(body);
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

  const plan = await createPlan(viewer, parsed.data);
  return applyGuestCookie(jsonResponse(plan, { status: 201 }), resolved);
}
