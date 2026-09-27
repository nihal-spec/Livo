import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@livo/db";
import { createGuestSession } from "@/modules/auth/index.js";
import { _resetRateLimitsForTests } from "@/lib/rateLimit.js";
import { PlaceNotFoundError, RateLimitedError, revealContact, submitReport } from "../index.js";

describe("places module", () => {
  let publishedPlaceId: string;

  beforeEach(() => {
    _resetRateLimitsForTests();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function getPublishedPlaceId(): Promise<string> {
    if (publishedPlaceId) return publishedPlaceId;
    const place = await prisma.place.findFirstOrThrow({ where: { status: "PUBLISHED", category: "ACCOMMODATION" } });
    publishedPlaceId = place.id;
    return publishedPlaceId;
  }

  it("reveals contact details for a published place", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const placeId = await getPublishedPlaceId();
    const contact = await revealContact(placeId, { kind: "guest", guestSessionId });
    expect(contact).toHaveProperty("phoneE164");
    expect(contact).toHaveProperty("whatsappE164");
  });

  it("throws PlaceNotFoundError for a nonexistent place", async () => {
    const { id: guestSessionId } = await createGuestSession();
    await expect(
      revealContact("nonexistent_place_id", { kind: "guest", guestSessionId }),
    ).rejects.toThrow(PlaceNotFoundError);
  });

  it("throws PlaceNotFoundError for an unpublished (draft) place", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const region = await prisma.region.findFirstOrThrow();
    const draft = await prisma.$transaction(async (tx) => {
      const id = `test_place_draft_${Date.now()}`;
      await tx.$executeRaw`
        INSERT INTO "place" ("id", "slug", "category", "name", "regionId", "location", "addressLine", "status", "updatedAt")
        VALUES (${id}, ${id}, 'ACCOMMODATION', 'Draft place', ${region.id}, ST_SetSRID(ST_MakePoint(76.3, 10.0), 4326)::geography, 'x', 'DRAFT', now())
      `;
      return id;
    });

    await expect(revealContact(draft, { kind: "guest", guestSessionId })).rejects.toThrow(PlaceNotFoundError);
    await prisma.place.delete({ where: { id: draft } });
  });

  it("rate-limits contact reveals to 10/hour per viewer", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const placeId = await getPublishedPlaceId();
    const viewer = { kind: "guest" as const, guestSessionId };
    for (let i = 0; i < 10; i++) {
      await expect(revealContact(placeId, viewer)).resolves.toBeDefined();
    }
    await expect(revealContact(placeId, viewer)).rejects.toThrow(RateLimitedError);
  });

  it("a different viewer has their own contact-reveal quota", async () => {
    const placeId = await getPublishedPlaceId();
    const { id: guestA } = await createGuestSession();
    const { id: guestB } = await createGuestSession();
    for (let i = 0; i < 10; i++) {
      await revealContact(placeId, { kind: "guest", guestSessionId: guestA });
    }
    await expect(revealContact(placeId, { kind: "guest", guestSessionId: guestA })).rejects.toThrow(RateLimitedError);
    await expect(revealContact(placeId, { kind: "guest", guestSessionId: guestB })).resolves.toBeDefined();
  });

  it("submits a report and persists it with the reporting guest session", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const placeId = await getPublishedPlaceId();
    const { id: reportId } = await submitReport(
      placeId,
      { kind: "guest", guestSessionId },
      { reason: "WRONG_PRICE", detail: "Rent is actually higher now" },
    );

    const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(report.reason).toBe("WRONG_PRICE");
    expect(report.guestSessionId).toBe(guestSessionId);
    expect(report.status).toBe("OPEN");

    await prisma.report.delete({ where: { id: reportId } });
  });

  it("rate-limits reports to 5/hour per viewer", async () => {
    const { id: guestSessionId } = await createGuestSession();
    const placeId = await getPublishedPlaceId();
    const viewer = { kind: "guest" as const, guestSessionId };
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await submitReport(placeId, viewer, { reason: "OTHER" });
      ids.push(r.id);
    }
    await expect(submitReport(placeId, viewer, { reason: "OTHER" })).rejects.toThrow(RateLimitedError);
    await prisma.report.deleteMany({ where: { id: { in: ids } } });
  });
});
