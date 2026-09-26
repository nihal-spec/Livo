import type { NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "@/modules/auth/index.js";
import type { ResolvedViewer } from "@/modules/auth/index.js";

/** Applies a freshly-issued guest cookie (from resolveViewer) to a response. */
export function applyGuestCookie(res: NextResponse, resolved: ResolvedViewer): NextResponse {
  if (!resolved.cookieToSet) return res;
  res.cookies.set(GUEST_COOKIE_NAME, resolved.cookieToSet.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: resolved.cookieToSet.maxAge,
  });
  return res;
}
