import { prisma } from "@livo/db";

/**
 * Permission-based RBAC (ADMIN_SPEC.md §2). Permission checks live here and
 * in the service layer — UI hiding is cosmetic only. Never trust a client
 * to enforce these.
 */

export class ForbiddenError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

/** All permission strings currently in use (ADMIN_SPEC.md §2), for validation/tests. */
export const KNOWN_PERMISSIONS = [
  "dashboard:view",
  "places:read",
  "places:create",
  "places:update",
  "places:verify",
  "places:publish",
  "places:merge",
  "data:assumptions",
  "data:read",
  "data:sync",
  "jobs:read",
  "jobs:retry",
  "reports:read",
  "reports:resolve",
  "users:read",
  "users:pii",
  "users:suspend",
  "guests:read",
  "ai:read",
  "ai:content",
  "flags:manage",
  "roles:manage",
  "audit:read",
  "system:read",
  "settings:manage",
] as const;
export type Permission = (typeof KNOWN_PERMISSIONS)[number];

/** Returns the deduplicated set of permissions granted to a user across all their roles. */
export async function getPermissionsForUser(userId: string): Promise<Set<string>> {
  const grants = await prisma.rolePermission.findMany({
    where: { role: { users: { some: { userId } } } },
    select: { permission: true },
  });
  return new Set(grants.map((g) => g.permission));
}

export async function can(userId: string, permission: Permission | string): Promise<boolean> {
  const permissions = await getPermissionsForUser(userId);
  return permissions.has(permission);
}

/** Throws ForbiddenError if the user lacks the permission. Use at the top of every admin service call. */
export async function requirePermission(userId: string, permission: Permission | string): Promise<void> {
  if (!(await can(userId, permission))) {
    throw new ForbiddenError(permission);
  }
}

/**
 * Guards against a Super-Admin-only self-service escalation loophole
 * (ADMIN_SPEC.md §2: "nobody can change their own roles").
 */
export function assertNotSelfRoleChange(actingUserId: string, targetUserId: string): void {
  if (actingUserId === targetUserId) {
    throw new ForbiddenError("roles:manage (cannot change your own roles)");
  }
}
