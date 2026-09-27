import { NextRequest } from "next/server";
import { resolveViewer } from "@/modules/auth/index.js";
import { PlaceNotFoundError, RateLimitedError, revealContact } from "@/modules/places/index.js";
import { jsonResponse } from "@/lib/json.js";
import { applyGuestCookie } from "@/lib/cookies.js";

/** POST /api/v1/places/:id/contact-reveal — API_SPEC.md §3. Guest+, 10/hour. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const resolved = await resolveViewer(req);
  try {
    const contact = await revealContact(params.id, resolved.viewer);
    return applyGuestCookie(jsonResponse(contact), resolved);
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
