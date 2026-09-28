import type { NextRequest } from "next/server";
import { auth } from "@/auth.js";
import { createGuestSession, findGuestSessionByToken, touchGuestSession, GUEST_COOKIE_NAME } from "./session.js";
import type { Viewer } from "./session.js";

/**
 * Resolves the caller's Viewer: a signed-in Auth.js user takes priority
 * over the guest cookie (ADR-007/008); otherwise falls back to the guest
 * cookie, issuing a fresh guest session when it's missing or expired.
 * Every route handler that needs a viewer calls this first, then applies
 * `cookieToSet` to its NextResponse before returning.
 */
export interface ResolvedViewer {
  viewer: Viewer;
  cookieToSet?: { name: string; value: string; maxAge: number };
}

const GUEST_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export async function resolveViewer(req: NextRequest): Promise<ResolvedViewer> {
  const session = await auth();
  if (session?.user?.id) {
    return { viewer: { kind: "user", userId: session.user.id } };
  }

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
