import { Prisma } from "@prisma/client";
import { prisma } from "../index.js";

/**
 * Geo access layer (ADR-003): Prisma has no native PostGIS type, so every
 * read/write that touches a `geography` column goes through this file using
 * parameterized `$queryRaw`/`$executeRaw` tagged templates — never
 * `$queryRawUnsafe`/string concatenation, and never from outside this
 * module (see ARCHITECTURE.md §2, module boundary rule).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Set (or move) a place's pin. Called on create and whenever ops repositions it. */
export async function setPlaceLocation(placeId: string, point: LatLng): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "place"
    SET "location" = ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
    WHERE "id" = ${placeId}
  `;
}

export async function setDestinationLocation(destinationId: string, point: LatLng): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "destination"
    SET "location" = ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
    WHERE "id" = ${destinationId}
  `;
}

export async function setRegionCentroid(regionId: string, point: LatLng): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "region"
    SET "centroid" = ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
    WHERE "id" = ${regionId}
  `;
}

export interface AccommodationCandidate {
  placeId: string;
  slug: string;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  roomId: string;
  pricePaise: bigint;
  priceBasis: string;
  depositPaise: bigint | null;
  ac: boolean;
  privateBath: boolean;
  occupancy: string;
}

export interface AccommodationCandidateFilters {
  destinationId: string;
  radiusM: number;
  priceMinPaise?: bigint;
  priceMaxPaise?: bigint;
  ac?: boolean;
  privateBath?: boolean;
  limit?: number;
}

/**
 * Candidate accommodation search: PostGIS radius pre-filter + join to room
 * options (ARCHITECTURE.md §3-4). Returns raw candidates; ranking, full-cost
 * computation and reason chips happen in the search service (TypeScript),
 * not here.
 */
export async function findAccommodationCandidates(
  filters: AccommodationCandidateFilters,
): Promise<AccommodationCandidate[]> {
  const { destinationId, radiusM, priceMinPaise, priceMaxPaise, ac, privateBath, limit = 500 } = filters;

  const rows = await prisma.$queryRaw<
    Array<{
      placeId: string;
      slug: string;
      name: string;
      lat: number;
      lng: number;
      distanceM: number;
      roomId: string;
      pricePaise: bigint;
      priceBasis: string;
      depositPaise: bigint | null;
      ac: boolean;
      privateBath: boolean;
      occupancy: string;
    }>
  >`
    SELECT
      p."id"            AS "placeId",
      p."slug"          AS "slug",
      p."name"          AS "name",
      ST_Y(p."location"::geometry) AS "lat",
      ST_X(p."location"::geometry) AS "lng",
      ST_Distance(p."location", d."location") AS "distanceM",
      ro."id"           AS "roomId",
      ro."pricePaise"   AS "pricePaise",
      ro."priceBasis"   AS "priceBasis",
      ro."depositPaise" AS "depositPaise",
      ro."ac"           AS "ac",
      ro."privateBath"  AS "privateBath",
      ro."occupancy"    AS "occupancy"
    FROM "place" p
    JOIN "destination" d ON d."id" = ${destinationId}
    JOIN "room_option" ro ON ro."placeId" = p."id"
    WHERE p."status" = 'PUBLISHED'
      AND p."deletedAt" IS NULL
      AND p."category" = 'ACCOMMODATION'
      AND ST_DWithin(p."location", d."location", ${radiusM})
      ${priceMinPaise != null ? Prisma.sql`AND ro."pricePaise" >= ${priceMinPaise}` : Prisma.empty}
      ${priceMaxPaise != null ? Prisma.sql`AND ro."pricePaise" <= ${priceMaxPaise}` : Prisma.empty}
      ${ac != null ? Prisma.sql`AND ro."ac" = ${ac}` : Prisma.empty}
      ${privateBath != null ? Prisma.sql`AND ro."privateBath" = ${privateBath}` : Prisma.empty}
    ORDER BY "distanceM" ASC
    LIMIT ${limit}
  `;

  return rows;
}

/** Nearest-neighbour helper for dedupe on ingest (DATA_STRATEGY.md §6). */
export async function findNearbyPlaces(
  point: LatLng,
  withinM: number,
  category?: string,
): Promise<Array<{ id: string; name: string; distanceM: number }>> {
  return prisma.$queryRaw`
    SELECT
      p."id" AS "id",
      p."name" AS "name",
      ST_Distance(p."location", ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS "distanceM"
    FROM "place" p
    WHERE p."deletedAt" IS NULL
      AND ST_DWithin(p."location", ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${withinM})
      ${category ? Prisma.sql`AND p."category" = ${category}::"PlaceCategory"` : Prisma.empty}
    ORDER BY "distanceM" ASC
    LIMIT 20
  `;
}
