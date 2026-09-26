import { randomBytes } from "node:crypto";
import { prisma } from "@livo/db";
import { requirePermission } from "@/modules/rbac/index.js";
import { mutateWithAudit } from "@/modules/audit/index.js";
import type { AccommodationKind, GenderPolicy, Occupancy, PriceBasis } from "@livo/schemas";
import { setPlaceLocation } from "@livo/db/geo";

function newPlaceId(): string {
  return `place_${randomBytes(12).toString("hex")}`;
}

/**
 * Admin places editor service (ADMIN_SPEC.md §3 "Places / Accommodations").
 * This is the tool the data-collection sprint runs on (MASTER_PLAN.md §51,
 * task 5) — every write here is permission-checked and audited, and every
 * fact that reaches a listing carries a FactProvenance row (DATA_STRATEGY.md
 * §2), because this is the only place real listing data enters the system.
 */

export interface AdminActor {
  userId: string;
  requestId: string;
}

export interface CreatePlaceInput {
  name: string;
  slug: string;
  regionId: string;
  addressLine: string;
  landmark?: string;
  phoneE164?: string;
  location: { lat: number; lng: number };
  accommodation: {
    kind: AccommodationKind;
    genderPolicy: GenderPolicy;
    foodIncluded?: boolean;
  };
}

export async function listPlaces(
  actor: AdminActor,
  filters: { status?: string; category?: string; q?: string; page?: number; pageSize?: number } = {},
) {
  await requirePermission(actor.userId, "places:read");

  const { status, category, q, page = 1, pageSize = 20 } = filters;
  const where = {
    deletedAt: null,
    ...(status ? { status: status as never } : {}),
    ...(category ? { category: category as never } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.place.findMany({
      where,
      include: { accommodationDetail: true, roomOptions: true },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.place.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function createPlace(actor: AdminActor, input: CreatePlaceInput) {
  await requirePermission(actor.userId, "places:create");
  const placeId = newPlaceId();

  return mutateWithAudit(
    {
      actorUserId: actor.userId,
      actorType: "ADMIN",
      action: "place.create",
      entityType: "Place",
      entityId: placeId,
      requestId: actor.requestId,
    },
    async (tx) => {
      // `location` is a required PostGIS geography column, Unsupported by
      // the Prisma client (ADR-003) — created via raw SQL in the same
      // transaction as everything else, with the pin set at creation time
      // rather than as a separate follow-up update.
      await tx.$executeRaw`
        INSERT INTO "place"
          ("id", "slug", "category", "name", "regionId", "location", "addressLine", "landmark", "phoneE164", "status", "createdById", "updatedById", "updatedAt")
        VALUES (
          ${placeId}, ${input.slug}, 'ACCOMMODATION', ${input.name}, ${input.regionId},
          ST_SetSRID(ST_MakePoint(${input.location.lng}, ${input.location.lat}), 4326)::geography,
          ${input.addressLine}, ${input.landmark ?? null}, ${input.phoneE164 ?? null},
          'DRAFT', ${actor.userId}, ${actor.userId}, now()
        )
      `;
      await tx.accommodationDetail.create({
        data: {
          placeId,
          kind: input.accommodation.kind,
          genderPolicy: input.accommodation.genderPolicy,
          foodIncluded: input.accommodation.foodIncluded ?? null,
        },
      });
      const created = await tx.place.findUniqueOrThrow({ where: { id: placeId } });
      return { result: created, after: { name: created.name, status: created.status } };
    },
  );
}

export interface UpdatePlaceInput {
  name?: string;
  addressLine?: string;
  landmark?: string;
  phoneE164?: string;
  location?: { lat: number; lng: number };
}

export class OptimisticLockError extends Error {
  constructor() {
    super("Place was modified by someone else — reload and try again.");
    this.name = "OptimisticLockError";
  }
}

export async function updatePlace(
  actor: AdminActor,
  placeId: string,
  expectedVersion: number,
  patch: UpdatePlaceInput,
) {
  await requirePermission(actor.userId, "places:update");

  const before = await prisma.place.findUniqueOrThrow({ where: { id: placeId } });
  if (before.version !== expectedVersion) throw new OptimisticLockError();

  const updated = await mutateWithAudit(
    {
      actorUserId: actor.userId,
      actorType: "ADMIN",
      action: "place.update",
      entityType: "Place",
      entityId: placeId,
      requestId: actor.requestId,
      before: { name: before.name, addressLine: before.addressLine, version: before.version },
    },
    async (tx) => {
      const result = await tx.place.updateMany({
        where: { id: placeId, version: expectedVersion },
        data: {
          name: patch.name,
          addressLine: patch.addressLine,
          landmark: patch.landmark,
          phoneE164: patch.phoneE164,
          updatedById: actor.userId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new OptimisticLockError();
      const row = await tx.place.findUniqueOrThrow({ where: { id: placeId } });
      return { result: row, after: { name: row.name, addressLine: row.addressLine, version: row.version } };
    },
  );

  if (patch.location) await setPlaceLocation(placeId, patch.location);
  return updated;
}

export async function addRoomOption(
  actor: AdminActor,
  placeId: string,
  room: {
    occupancy: Occupancy;
    ac: boolean;
    privateBath: boolean;
    priceBasis: PriceBasis;
    pricePaise: bigint;
    depositPaise?: bigint;
    availableBeds?: number;
  },
) {
  await requirePermission(actor.userId, "places:update");

  return mutateWithAudit(
    {
      actorUserId: actor.userId,
      actorType: "ADMIN",
      action: "place.room_option.add",
      entityType: "Place",
      entityId: placeId,
      requestId: actor.requestId,
    },
    async (tx) => {
      const created = await tx.roomOption.create({
        data: {
          placeId,
          occupancy: room.occupancy,
          ac: room.ac,
          privateBath: room.privateBath,
          priceBasis: room.priceBasis,
          pricePaise: room.pricePaise,
          depositPaise: room.depositPaise,
          availableBeds: room.availableBeds,
        },
      });
      return { result: created, after: { roomOptionId: created.id, pricePaise: created.pricePaise.toString() } };
    },
  );
}

export interface VerifyFactInput {
  factKey: string;
  method: "PHONE_CALL" | "SITE_VISIT" | "PARTNER_PORTAL" | "DOCUMENT" | "API_SYNC" | "USER_REPORT";
  note?: string;
  dataSourceKey?: string; // defaults to "admin_entry"
}

/** Records that an admin operator confirmed a fact by the given method (DATA_STRATEGY.md §2). */
export async function verifyFact(actor: AdminActor, placeId: string, input: VerifyFactInput) {
  await requirePermission(actor.userId, "places:verify");

  const dataSource = await prisma.dataSource.findUniqueOrThrow({
    where: { key: input.dataSourceKey ?? "admin_entry" },
  });

  return mutateWithAudit(
    {
      actorUserId: actor.userId,
      actorType: "ADMIN",
      action: "place.fact.verify",
      entityType: "Place",
      entityId: placeId,
      requestId: actor.requestId,
      before: { factKey: input.factKey },
    },
    async (tx) => {
      const now = new Date();
      const created = await tx.factProvenance.create({
        data: {
          placeId,
          factKey: input.factKey,
          sourceType: "VERIFIED",
          dataSourceId: dataSource.id,
          observedAt: now,
          verifiedAt: now,
          verifiedById: actor.userId,
          method: input.method,
          confidence: "HIGH",
          note: input.note,
        },
      });
      return { result: created, after: { factKey: created.factKey, verifiedAt: now.toISOString() } };
    },
  );
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot move a place from ${from} to ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["PUBLISHED", "REJECTED", "DRAFT"],
  PUBLISHED: ["UNVERIFIABLE", "CLOSED"],
  UNVERIFIABLE: ["PUBLISHED", "CLOSED"],
  REJECTED: ["DRAFT"],
  CLOSED: [],
};

export async function transitionPlaceStatus(actor: AdminActor, placeId: string, toStatus: string) {
  const permission = toStatus === "PUBLISHED" ? "places:publish" : "places:update";
  await requirePermission(actor.userId, permission);

  const place = await prisma.place.findUniqueOrThrow({ where: { id: placeId } });
  if (!ALLOWED_TRANSITIONS[place.status]?.includes(toStatus)) {
    throw new InvalidTransitionError(place.status, toStatus);
  }

  return mutateWithAudit(
    {
      actorUserId: actor.userId,
      actorType: "ADMIN",
      action: `place.status.${toStatus.toLowerCase()}`,
      entityType: "Place",
      entityId: placeId,
      requestId: actor.requestId,
      before: { status: place.status },
    },
    async (tx) => {
      const updated = await tx.place.update({
        where: { id: placeId },
        data: { status: toStatus as never, updatedById: actor.userId, version: { increment: 1 } },
      });
      return { result: updated, after: { status: updated.status } };
    },
  );
}
