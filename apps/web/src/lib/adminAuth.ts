import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/config/env.js";
import type { AdminActor } from "@/modules/admin-places/index.js";

/**
 * TEMPORARY, dev-only admin identity resolution.
 *
 * Auth.js/Google OAuth sign-in is not wired up yet (see ADR-008 and the
 * note in modules/auth/resolveViewer.ts) — there is no real admin session
 * to read a user id from. Until that exists, admin API routes accept an
 * `x-livo-admin-user-id` header identifying which seeded user is acting,
 * and ONLY in non-production environments. In production this header is
 * ignored entirely and every admin route refuses the request outright, so
 * this can never become a real bypass. Replace this file's contents with
 * a call to the Auth.js session (getServerSession) once that lands —
 * everything downstream (requirePermission, mutateWithAudit) already
 * expects a real userId and needs no changes.
 */
export function resolveAdminActor(req: NextRequest): AdminActor | null {
  if (env.NODE_ENV === "production") return null;

  const userId = req.headers.get("x-livo-admin-user-id");
  if (!userId) return null;

  return { userId, requestId: req.headers.get("x-request-id") ?? randomUUID() };
}
