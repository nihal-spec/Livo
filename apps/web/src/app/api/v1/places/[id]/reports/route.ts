import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveViewer } from "@/modules/auth/index.js";
import { PlaceNotFoundError, RateLimitedError, REPORT_REASONS, submitReport } from "@/modules/places/index.js";
import { jsonResponse } from "@/lib/json.js";
import { applyGuestCookie } from "@/lib/cookies.js";

const Body = z.object({
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(1000).optional(),
});

/** POST /api/v1/places/:id/reports — API_SPEC.md §3. Guest+, 5/hour. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveViewer(req);

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { type: "https://livo.app/errors/validation", title: "Invalid request", status: 422, code: "VALIDATION_FAILED" },
      { status: 422 },
    );
  }

  try {
    const report = await submitReport(params.id, resolved.viewer, parsed.data);
    return applyGuestCookie(jsonResponse(report, { status: 201 }), resolved);
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return jsonResponse(
        { type: "https://livo.app/errors/rate-limited", title: err.message, status: 429, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(err.retryAfterS) } },
      );
    }
    if (err instanceof PlaceNotFoundError) {
      return jsonResponse(
        { type: "https://livo.app/errors/not-found", title: err.message, status: 404, code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    throw err;
  }
}
