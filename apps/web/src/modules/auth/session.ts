import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@livo/db";

/**
 * Guest-first auth (ADR-008). This module owns GuestSession and the
 * guest<->user merge; nothing outside it should touch those rows directly
 * (ARCHITECTURE.md §2 module boundary rule).
 */

export const GUEST_COOKIE_NAME = "livo_gs";
const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type Viewer =
  | { kind: "anonymous" }
  | { kind: "guest"; guestSessionId: string }
  | { kind: "user"; userId: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generates a new opaque cookie value. Never stored raw — only its hash is. */
export function generateGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Looks up a guest session by its raw cookie value. Returns null if the
 * cookie is missing, unknown, or expired — the caller (middleware) then
 * calls createGuestSession to issue a fresh one.
 */
export async function findGuestSessionByToken(token: string) {
  const id = hashToken(token);
  const session = await prisma.guestSession.findUnique({ where: { id } });
  if (!session || session.expiresAt < new Date()) return null;
  return session;
}

export async function createGuestSession(uaHash?: string): Promise<{ token: string; id: string; expiresAt: Date }> {
  const token = generateGuestToken();
  const id = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MS);
  await prisma.guestSession.create({
    data: { id, createdAt: now, lastSeenAt: now, expiresAt, uaHash },
  });
  return { token, id, expiresAt };
}

/** Sliding expiry: called on each request that carries a valid guest cookie. */
export async function touchGuestSession(id: string): Promise<Date> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GUEST_SESSION_TTL_MS);
  await prisma.guestSession.update({ where: { id }, data: { lastSeenAt: now, expiresAt } });
  return expiresAt;
}

/**
 * Transactionally reassigns a guest's plans and saved items to a newly
 * signed-in user (ARCHITECTURE.md §7 sequence diagram), then marks the
 * guest session as merged so it can no longer be resurrected.
 */
export async function mergeGuestIntoUser(guestSessionId: string, userId: string): Promise<{ plansMoved: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.plan.updateMany({
      where: { guestSessionId },
      data: { ownerUserId: userId, guestSessionId: null },
    });
    await tx.guestSession.update({
      where: { id: guestSessionId },
      data: { mergedIntoUserId: userId },
    });
    return { plansMoved: count };
  });
  return result;
}

export async function getViewerFromCookie(cookieValue: string | undefined): Promise<Viewer> {
  if (!cookieValue) return { kind: "anonymous" };
  const session = await findGuestSessionByToken(cookieValue);
  if (!session) return { kind: "anonymous" };
  return { kind: "guest", guestSessionId: session.id };
}

