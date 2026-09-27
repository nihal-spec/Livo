import { prisma } from "@livo/db";
import { checkLimit } from "@/lib/rateLimit.js";
import type { Viewer } from "@/modules/auth/index.js";

/**
 * Public place actions (API_SPEC.md §3): revealing contact details and
 * reporting a problem. Both are rate-limited per viewer (guest session or
 * user), matching the limits API_SPEC.md documents.
 */

function viewerKey(viewer: Viewer): string {
  if (viewer.kind === "user") return `user:${viewer.userId}`;
  if (viewer.kind === "guest") return `guest:${viewer.guestSessionId}`;
  return "anonymous";
}

export class RateLimitedError extends Error {
  constructor(public retryAfterS: number) {
    super("Too many requests — try again shortly.");
    this.name = "RateLimitedError";
  }
}

export class PlaceNotFoundError extends Error {
  constructor() {
    super("Place not found or not published.");
    this.name = "PlaceNotFoundError";
  }
}

export interface ContactDetails {
  phoneE164: string | null;
  whatsappE164: string | null;
}

const CONTACT_REVEAL_LIMIT = 10;
const CONTACT_REVEAL_WINDOW_MS = 60 * 60_000; // 1 hour

/** API_SPEC.md §3: POST /places/:id/contact-reveal, 10/hour per viewer. */
export async function revealContact(placeId: string, viewer: Viewer): Promise<ContactDetails> {
  const limit = checkLimit(`contact-reveal:${viewerKey(viewer)}`, CONTACT_REVEAL_LIMIT, CONTACT_REVEAL_WINDOW_MS);
  if (!limit.allowed) throw new RateLimitedError(limit.retryAfterS);

  const place = await prisma.place.findFirst({
    where: { id: placeId, status: "PUBLISHED", deletedAt: null },
    select: { phoneE164: true, whatsappE164: true },
  });
  if (!place) throw new PlaceNotFoundError();

  return place;
}

export const REPORT_REASONS = ["WRONG_PRICE", "CLOSED", "WRONG_LOCATION", "FAKE", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 60 * 60_000; // 1 hour

/** API_SPEC.md §3: POST /places/:id/reports, 5/hour per viewer. */
export async function submitReport(
  placeId: string,
  viewer: Viewer,
  input: { reason: ReportReason; detail?: string },
): Promise<{ id: string }> {
  const limit = checkLimit(`report:${viewerKey(viewer)}`, REPORT_LIMIT, REPORT_WINDOW_MS);
  if (!limit.allowed) throw new RateLimitedError(limit.retryAfterS);

  const place = await prisma.place.findFirst({ where: { id: placeId, deletedAt: null }, select: { id: true } });
  if (!place) throw new PlaceNotFoundError();

  const report = await prisma.report.create({
    data: {
      placeId,
      reason: input.reason,
      detail: input.detail,
      reporterUserId: viewer.kind === "user" ? viewer.userId : null,
      guestSessionId: viewer.kind === "guest" ? viewer.guestSessionId : null,
    },
  });
  return { id: report.id };
}
