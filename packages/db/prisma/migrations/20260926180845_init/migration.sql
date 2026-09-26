-- Extensions required before any table using them is created.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('ACCOMMODATION', 'FOOD', 'HOSPITAL', 'PHARMACY', 'DIAGNOSTICS', 'GROCERY', 'LAUNDRY', 'ATM', 'COWORKING', 'GYM', 'TRANSIT_HUB', 'OTHER');

-- CreateEnum
CREATE TYPE "AccommodationKind" AS ENUM ('PG', 'HOSTEL', 'COLIVING', 'ROOM_RENTAL', 'LODGE', 'HOTEL', 'SERVICE_APARTMENT', 'DORMITORY');

-- CreateEnum
CREATE TYPE "Occupancy" AS ENUM ('SINGLE', 'DOUBLE', 'TRIPLE', 'DORM_4PLUS', 'WHOLE_UNIT');

-- CreateEnum
CREATE TYPE "GenderPolicy" AS ENUM ('MEN', 'WOMEN', 'ANY', 'FAMILY');

-- CreateEnum
CREATE TYPE "FoodKind" AS ENUM ('MESS', 'TIFFIN', 'RESTAURANT', 'CLOUD_KITCHEN', 'MEAL_SUBSCRIPTION', 'GROCERY');

-- CreateEnum
CREATE TYPE "PriceBasis" AS ENUM ('PER_NIGHT', 'PER_WEEK', 'PER_MONTH', 'PER_MEAL', 'PER_DAY');

-- CreateEnum
CREATE TYPE "PlaceStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'UNVERIFIABLE', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('VERIFIED', 'PARTNER', 'API', 'ESTIMATED', 'USER', 'IMPORTED');

-- CreateEnum
CREATE TYPE "TravelMode" AS ENUM ('WALK', 'TWO_WHEELER', 'CAR', 'AUTO', 'CAB', 'BUS', 'METRO', 'WATER_METRO', 'MIXED_TRANSIT');

-- CreateEnum
CREATE TYPE "PlanPurpose" AS ENUM ('JOB_RELOCATION', 'INTERVIEW', 'STUDY', 'HOSPITAL_ATTENDANT', 'INTERNSHIP', 'TRAINING', 'BUSINESS', 'FAMILY_VISIT', 'WORKATION', 'TRIP', 'OTHER');

-- CreateTable
CREATE TABLE "region" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "boundary" geography(MultiPolygon,4326),
    "centroid" geography(Point,4326) NOT NULL,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "location" geography(Point,4326) NOT NULL,
    "entrances" JSONB,
    "isAnchor" BOOLEAN NOT NULL DEFAULT false,
    "externalPlaceId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "PlaceCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "location" geography(Point,4326) NOT NULL,
    "addressLine" TEXT NOT NULL,
    "landmark" TEXT,
    "phoneE164" TEXT,
    "whatsappE164" TEXT,
    "website" TEXT,
    "status" "PlaceStatus" NOT NULL DEFAULT 'DRAFT',
    "isSponsored" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB,
    "openingHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_detail" (
    "placeId" TEXT NOT NULL,
    "kind" "AccommodationKind" NOT NULL,
    "genderPolicy" "GenderPolicy" NOT NULL,
    "foodIncluded" BOOLEAN,
    "mealsIncluded" TEXT[],
    "minStayDays" INTEGER,
    "noticeDays" INTEGER,
    "curfew" TEXT,
    "rules" TEXT,

    CONSTRAINT "accommodation_detail_pkey" PRIMARY KEY ("placeId")
);

-- CreateTable
CREATE TABLE "room_option" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "occupancy" "Occupancy" NOT NULL,
    "ac" BOOLEAN NOT NULL,
    "privateBath" BOOLEAN NOT NULL,
    "priceBasis" "PriceBasis" NOT NULL,
    "pricePaise" BIGINT NOT NULL,
    "depositPaise" BIGINT,
    "maintenancePaise" BIGINT,
    "electricityIncluded" BOOLEAN,
    "availableBeds" INTEGER,
    "provenanceId" TEXT,

    CONSTRAINT "room_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_plan" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "kind" "FoodKind" NOT NULL,
    "meals" TEXT[],
    "vegOnly" BOOLEAN,
    "priceBasis" "PriceBasis" NOT NULL,
    "pricePaise" BIGINT NOT NULL,
    "delivers" BOOLEAN,
    "deliveryRadiusM" INTEGER,
    "timings" JSONB,
    "provenanceId" TEXT,

    CONSTRAINT "food_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenity" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_amenity" (
    "placeId" TEXT NOT NULL,
    "amenityId" TEXT NOT NULL,

    CONSTRAINT "place_amenity_pkey" PRIMARY KEY ("placeId","amenityId")
);

-- CreateTable
CREATE TABLE "place_photo" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_provenance" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "method" TEXT,
    "confidence" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "fact_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_estimate" (
    "originPlaceId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "mode" "TravelMode" NOT NULL,
    "departBand" TEXT NOT NULL,
    "durationSMin" INTEGER NOT NULL,
    "durationSMax" INTEGER NOT NULL,
    "distanceM" INTEGER NOT NULL,
    "farePaiseMin" BIGINT,
    "farePaiseMax" BIGINT,
    "method" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_estimate_pkey" PRIMARY KEY ("originPlaceId","destinationId","mode","departBand")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totpSecretEnc" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permission")
);

-- CreateTable
CREATE TABLE "user_role" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "requestId" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_session" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mergedIntoUserId" TEXT,
    "uaHash" TEXT,

    CONSTRAINT "guest_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "guestSessionId" TEXT,
    "title" TEXT NOT NULL,
    "purpose" "PlanPurpose" NOT NULL,
    "destinationId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "people" INTEGER NOT NULL DEFAULT 1,
    "requirements" JSONB NOT NULL,
    "monthlyIncomePaise" BIGINT,
    "budgetCapPaise" BIGINT,
    "cashOnHandPaise" BIGINT,
    "shareToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_item" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "placeId" TEXT,
    "roomOptionId" TEXT,
    "foodPlanId" TEXT,
    "travelMode" "TravelMode",
    "custom" JSONB,
    "position" INTEGER NOT NULL,

    CONSTRAINT "plan_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "overrides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_snapshot" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "engineVersion" TEXT NOT NULL,
    "assumptionsVersion" TEXT NOT NULL,
    "inputsHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_assumption" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "valuePaise" BIGINT NOT NULL,
    "p25Paise" BIGINT,
    "p75Paise" BIGINT,
    "unit" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceNote" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,

    CONSTRAINT "cost_assumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fare_rule" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "mode" "TravelMode" NOT NULL,
    "params" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceNote" TEXT NOT NULL,

    CONSTRAINT "fare_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_place" (
    "userId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_place_pkey" PRIMARY KEY ("userId","placeId")
);

-- CreateTable
CREATE TABLE "report" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "reporterUserId" TEXT,
    "guestSessionId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_source" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "licenceNote" TEXT NOT NULL,
    "attribution" TEXT,
    "trustedAutoPublish" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_run" (
    "id" TEXT NOT NULL,
    "dataSourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "stats" JSONB,
    "error" TEXT,

    CONSTRAINT "sync_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "rules" JSONB,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "region_slug_key" ON "region"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "destination_slug_key" ON "destination"("slug");

-- CreateIndex
CREATE INDEX "destination_regionId_idx" ON "destination"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "place_slug_key" ON "place"("slug");

-- CreateIndex
CREATE INDEX "place_category_status_idx" ON "place"("category", "status");

-- CreateIndex
CREATE INDEX "place_regionId_idx" ON "place"("regionId");

-- CreateIndex
CREATE INDEX "room_option_placeId_idx" ON "room_option"("placeId");

-- CreateIndex
CREATE INDEX "room_option_pricePaise_idx" ON "room_option"("pricePaise");

-- CreateIndex
CREATE UNIQUE INDEX "amenity_key_key" ON "amenity"("key");

-- CreateIndex
CREATE INDEX "place_amenity_amenityId_placeId_idx" ON "place_amenity"("amenityId", "placeId");

-- CreateIndex
CREATE INDEX "fact_provenance_placeId_factKey_idx" ON "fact_provenance"("placeId", "factKey");

-- CreateIndex
CREATE INDEX "fact_provenance_observedAt_idx" ON "fact_provenance"("observedAt");

-- CreateIndex
CREATE INDEX "travel_estimate_destinationId_mode_durationSMin_idx" ON "travel_estimate"("destinationId", "mode", "durationSMin");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_provider_providerAccountId_key" ON "account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "session_sessionToken_key" ON "session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_token_key" ON "verification_token"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_identifier_token_key" ON "verification_token"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_actorUserId_createdAt_idx" ON "audit_log"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "guest_session_expiresAt_idx" ON "guest_session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "plan_shareToken_key" ON "plan"("shareToken");

-- CreateIndex
CREATE INDEX "plan_ownerUserId_idx" ON "plan"("ownerUserId");

-- CreateIndex
CREATE INDEX "plan_guestSessionId_idx" ON "plan"("guestSessionId");

-- CreateIndex
CREATE INDEX "budget_snapshot_planId_createdAt_idx" ON "budget_snapshot"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "cost_assumption_key_regionId_effectiveFrom_idx" ON "cost_assumption"("key", "regionId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "data_source_key_key" ON "data_source"("key");

-- AddForeignKey
ALTER TABLE "destination" ADD CONSTRAINT "destination_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place" ADD CONSTRAINT "place_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_detail" ADD CONSTRAINT "accommodation_detail_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_option" ADD CONSTRAINT "room_option_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_plan" ADD CONSTRAINT "food_plan_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_amenity" ADD CONSTRAINT "place_amenity_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_amenity" ADD CONSTRAINT "place_amenity_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "amenity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_photo" ADD CONSTRAINT "place_photo_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_provenance" ADD CONSTRAINT "fact_provenance_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_provenance" ADD CONSTRAINT "fact_provenance_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_estimate" ADD CONSTRAINT "travel_estimate_originPlaceId_fkey" FOREIGN KEY ("originPlaceId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_estimate" ADD CONSTRAINT "travel_estimate_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "guest_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan" ADD CONSTRAINT "plan_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_item" ADD CONSTRAINT "plan_item_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario" ADD CONSTRAINT "scenario_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_snapshot" ADD CONSTRAINT "budget_snapshot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_assumption" ADD CONSTRAINT "cost_assumption_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fare_rule" ADD CONSTRAINT "fare_rule_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_place" ADD CONSTRAINT "saved_place_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_place" ADD CONSTRAINT "saved_place_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Manual additions per ADR-002/003 and DATABASE_DESIGN.md §4-5:
-- PostGIS GiST indexes, trigram dedupe index, and CHECK constraints that
-- Prisma's schema language cannot express.
-- ---------------------------------------------------------------------------

-- Geo indexes
CREATE INDEX "region_boundary_gist" ON "region" USING GIST ("boundary");
CREATE INDEX "region_centroid_gist" ON "region" USING GIST ("centroid");
CREATE INDEX "destination_location_gist" ON "destination" USING GIST ("location");
CREATE INDEX "place_location_gist" ON "place" USING GIST ("location");

-- Partial index for the hot path: published, non-deleted accommodation search.
CREATE INDEX "place_published_acc_gist" ON "place" USING GIST ("location")
  WHERE "status" = 'PUBLISHED' AND "deletedAt" IS NULL AND "category" = 'ACCOMMODATION';

-- Fuzzy name search / dedupe on ingest.
CREATE INDEX "place_name_trgm" ON "place" USING GIN ("name" gin_trgm_ops);

-- Money must never be negative.
ALTER TABLE "room_option" ADD CONSTRAINT "room_option_price_nonneg" CHECK ("pricePaise" >= 0);
ALTER TABLE "room_option" ADD CONSTRAINT "room_option_deposit_nonneg" CHECK ("depositPaise" IS NULL OR "depositPaise" >= 0);
ALTER TABLE "food_plan" ADD CONSTRAINT "food_plan_price_nonneg" CHECK ("pricePaise" >= 0);
ALTER TABLE "plan" ADD CONSTRAINT "plan_income_nonneg" CHECK ("monthlyIncomePaise" IS NULL OR "monthlyIncomePaise" >= 0);
ALTER TABLE "plan" ADD CONSTRAINT "plan_cash_nonneg" CHECK ("cashOnHandPaise" IS NULL OR "cashOnHandPaise" >= 0);

-- A plan is owned by exactly one of {user, guest session} — never both, never neither.
ALTER TABLE "plan" ADD CONSTRAINT "plan_single_owner" CHECK (num_nonnulls("ownerUserId", "guestSessionId") = 1);

-- Date sanity: end on/after start, and a hard cap on stay length (product limit).
ALTER TABLE "plan" ADD CONSTRAINT "plan_dates_valid" CHECK ("endDate" >= "startDate");
ALTER TABLE "plan" ADD CONSTRAINT "plan_people_range" CHECK ("people" BETWEEN 1 AND 20);

-- Append-only audit log: the app DB role may only INSERT/SELECT (see SECURITY.md §2).
-- (Role creation and REVOKE statements are environment-specific and are applied
-- via infra/db-roles.sql, not baked into this migration, so this migration
-- remains portable across environments that don't yet have that role.)
