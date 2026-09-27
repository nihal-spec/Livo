import { cookies } from "next/headers";
import { createGuestSession, findGuestSessionByToken, touchGuestSession, GUEST_COOKIE_NAME } from "./session.js";
import type { Viewer } from "./session.js";

const GUEST_COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * Same guest-session resolution as resolveViewer.ts, but for Server
 * Actions and Route Handlers using next/headers' `cookies()` instead of a
 * NextRequest — the two entry points need different cookie APIs, but must
 * agree on the underlying session semantics (ADR-008).
 */
export async function resolveViewerForAction(): Promise<Viewer> {
  const store = cookies();
  const cookieValue = store.get(GUEST_COOKIE_NAME)?.value;

  if (cookieValue) {
    const session = await findGuestSessionByToken(cookieValue);
    if (session) {
      await touchGuestSession(session.id);
      return { kind: "guest", guestSessionId: session.id };
    }
  }

  const { token, id } = await createGuestSession();
  store.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE_S,
  });
  return { kind: "guest", guestSessionId: id };
}

/**
 * Read-only variant for Server Components, which cannot set cookies
 * (Next.js only allows cookie mutation from Server Actions and Route
 * Handlers). A visitor with no cookie yet resolves to "anonymous" here —
 * they simply can't own anything until they hit a Server Action.
 */
export async function resolveViewerReadOnly(): Promise<Viewer> {
  const store = cookies();
  const cookieValue = store.get(GUEST_COOKIE_NAME)?.value;
  if (!cookieValue) return { kind: "anonymous" };
  const session = await findGuestSessionByToken(cookieValue);
  if (!session) return { kind: "anonymous" };
  return { kind: "guest", guestSessionId: session.id };
}
