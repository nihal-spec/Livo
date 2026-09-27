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
  kind: string | null;
  genderPolicy: string | null;
  foodIncluded: boolean | null;
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

  // The WHERE clause is fixed text with no conditionally-included
  // fragments. Optional filters (price/ac/privateBath) are applied in JS
  // below instead of interpolating Prisma.sql/Prisma.empty per-filter.
  // That conditional-fragment pattern looks fine in isolation, but once
  // this query runs many times in the same process with different filter
  // *combinations* present (as real usage does: plain search, "cheaper"
  // scenario with a price cap, "private room" with an occupancy filter,
  // etc.), Postgres's prepared-statement cache can end up with a stale
  // plan for a $N placeholder count that no longer matches the current
  // call — surfacing as "syntax error at or near \"$3\"" on a query that
  // is, in isolation, completely valid. Fixed text with a fixed
  // placeholder count sidesteps the whole class of bug; result sets here
  // are small enough (radius-bounded, capped at `limit`) that filtering
  // the rest in JS costs nothing measurable.
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
      kind: string | null;
      genderPolicy: string | null;
      foodIncluded: boolean | null;
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
      ro."occupancy"    AS "occupancy",
      ad."kind"         AS "kind",
      ad."genderPolicy" AS "genderPolicy",
      ad."foodIncluded" AS "foodIncluded"
    FROM "place" p
    JOIN "destination" d ON d."id" = ${destinationId}
    JOIN "room_option" ro ON ro."placeId" = p."id"
    LEFT JOIN "accommodation_detail" ad ON ad."placeId" = p."id"
    WHERE p."status" = 'PUBLISHED'
      AND p."deletedAt" IS NULL
      AND p."category" = 'ACCOMMODATION'
      AND ST_DWithin(p."location", d."location", ${radiusM})
    ORDER BY "distanceM" ASC
    LIMIT ${limit}
  `;

  return rows.filter((r) => {
    if (priceMinPaise != null && r.pricePaise < priceMinPaise) return false;
    if (priceMaxPaise != null && r.pricePaise > priceMaxPaise) return false;
    if (ac != null && r.ac !== ac) return false;
    if (privateBath != null && r.privateBath !== privateBath) return false;
    return true;
  });
}

/** Nearest-neighbour helper for dedupe on ingest (DATA_STRATEGY.md §6). */
export async function findNearbyPlaces(
  point: LatLng,
  withinM: number,
  category?: string,
): Promise<Array<{ id: string; name: string; distanceM: number }>> {
  // See the comment in findAccommodationCandidates above: fixed query
  // text, optional filter applied in JS, to avoid the prepared-statement
  // parameter-count bug that conditional Prisma.sql/Prisma.empty
  // fragments caused there.
  const rows = await prisma.$queryRaw<Array<{ id: string; name: string; distanceM: number; category: string }>>`
    SELECT
      p."id" AS "id",
      p."name" AS "name",
      p."category" AS "category",
      ST_Distance(p."location", ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) AS "distanceM"
    FROM "place" p
    WHERE p."deletedAt" IS NULL
      AND ST_DWithin(p."location", ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${withinM})
    ORDER BY "distanceM" ASC
    LIMIT 20
  `;
  return category ? rows.filter((r) => r.category === category) : rows;
}

/** Straight-line distance from a place to a destination, in metres. Used by the compare view. */
export async function getDistanceToDestination(placeId: string, destinationId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ distanceM: number }>>`
    SELECT ST_Distance(p."location", d."location") AS "distanceM"
    FROM "place" p, "destination" d
    WHERE p."id" = ${placeId} AND d."id" = ${destinationId}
  `;
  return rows[0]?.distanceM ?? null;
}
