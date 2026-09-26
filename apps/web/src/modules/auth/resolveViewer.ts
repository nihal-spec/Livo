import type { NextRequest } from "next/server";
import { createGuestSession, findGuestSessionByToken, touchGuestSession, GUEST_COOKIE_NAME } from "./session.js";
import type { Viewer } from "./session.js";

/**
 * Resolves the caller's Viewer from the request's guest cookie, issuing a
 * fresh guest session when the cookie is missing or expired (ADR-008).
 * Every route handler that needs a viewer calls this first, then applies
 * `cookieToSet` to its NextResponse before returning.
 *
 * Signed-in users (Auth.js) are not wired up yet — see ADR-008 and
 * DECISIONS.md ADR-007/ADR-008 for the planned shape; until then every
 * caller resolves to a guest or anonymous viewer.
 */
export interface ResolvedViewer {
  viewer: Viewer;
  cookieToSet?: { name: string; value: string; maxAge: number };
}

const GUEST_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export async function resolveViewer(req: NextRequest): Promise<ResolvedViewer> {
  const cookieValue = req.cookies.get(GUEST_COOKIE_NAME)?.value;

  if (cookieValue) {
    const session = await findGuestSessionByToken(cookieValue);
    if (session) {
      await touchGuestSession(session.id);
      return { viewer: { kind: "guest", guestSessionId: session.id } };
    }
  }

  const { token, id } = await createGuestSession();
  return {
    viewer: { kind: "guest", guestSessionId: id },
    cookieToSet: { name: GUEST_COOKIE_NAME, value: token, maxAge: GUEST_COOKIE_MAX_AGE_S },
  };
}
