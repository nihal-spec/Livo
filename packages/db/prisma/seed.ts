import { PrismaClient } from "@prisma/client";

/**
 * Seed: roles/permissions (ADMIN_SPEC.md §2), amenities, the Kochi region,
 * and a handful of anchor destinations (DATA_STRATEGY.md §4.1) to develop
 * against. Idempotent (upserts) so it's safe to re-run.
 */
const prisma = new PrismaClient();

/** Deterministic-enough id suffix for seed rows (not for production use). */
function cuidLike(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash.toString(36).padStart(8, "0");
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [
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
    "flags:manage",
    "roles:manage",
    "audit:read",
    "system:read",
    "settings:manage",
  ],
  admin: [
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
    "flags:manage",
    "audit:read",
    "system:read",
  ],
  moderator: ["dashboard:view", "places:read", "reports:read", "reports:resolve", "users:read", "users:suspend"],
  data_manager: [
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
    "ai:read",
  ],
  support: ["dashboard:view", "places:read", "reports:read", "users:read", "users:pii", "guests:read"],
  business_manager: ["dashboard:view", "places:read", "places:create", "places:update"],
};

const AMENITIES = [
  { key: "WIFI", label: "Wi-Fi" },
  { key: "AC", label: "Air conditioning" },
  { key: "ATTACHED_BATH", label: "Attached bathroom" },
  { key: "LAUNDRY", label: "Laundry" },
  { key: "LIFT", label: "Lift" },
  { key: "GROUND_FLOOR_ROOM", label: "Ground floor room" },
  { key: "STEP_FREE", label: "Step-free access" },
  { key: "PARKING", label: "Parking" },
  { key: "POWER_BACKUP", label: "Power backup" },
  { key: "HOUSEKEEPING", label: "Housekeeping" },
  { key: "TV", label: "TV" },
  { key: "FRIDGE", label: "Fridge" },
  { key: "WASHING_MACHINE", label: "Washing machine" },
  { key: "CCTV", label: "CCTV" },
  { key: "WARDEN_ONSITE", label: "Warden on site" },
];

const DATA_SOURCES = [
  { key: "admin_entry", name: "Admin data entry", kind: "MANUAL", licenceNote: "Livo first-party" },
  { key: "partner_form", name: "Partner submission form", kind: "MANUAL", licenceNote: "Owner consent captured" },
  {
    key: "osm_geofabrik",
    name: "OpenStreetMap (Geofabrik Kerala extract)",
    kind: "IMPORT",
    licenceNote: "ODbL — attribution required",
    attribution: "© OpenStreetMap contributors",
  },
  {
    key: "livo_survey",
    name: "Livo cost survey",
    kind: "SURVEY",
    licenceNote: "Livo first-party research",
  },
];

async function main() {
  for (const [key, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: {},
      create: { key, name: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) },
    });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permission: { roleId: role.id, permission } },
        update: {},
        create: { roleId: role.id, permission },
      });
    }
  }
  console.log(`Seeded ${Object.keys(ROLE_PERMISSIONS).length} roles`);

  for (const amenity of AMENITIES) {
    await prisma.amenity.upsert({ where: { key: amenity.key }, update: {}, create: amenity });
  }
  console.log(`Seeded ${AMENITIES.length} amenities`);

  for (const source of DATA_SOURCES) {
    await prisma.dataSource.upsert({ where: { key: source.key }, update: {}, create: source });
  }
  console.log(`Seeded ${DATA_SOURCES.length} data sources`);

  // Kochi region. The `centroid` column is a required PostGIS geography type,
  // which Prisma treats as Unsupported — so region/destination rows with a
  // location are created entirely via raw SQL (ADR-003), not the generated
  // client, which would otherwise omit the NOT NULL geography column.
  const kochiId = `reg_${cuidLike("kochi")}`;
  await prisma.$executeRaw`
    INSERT INTO "region" ("id", "kind", "slug", "name", "centroid")
    VALUES (${kochiId}, 'CITY', 'kochi', 'Kochi', ST_SetSRID(ST_MakePoint(76.2673, 9.9312), 4326)::geography)
    ON CONFLICT ("slug") DO NOTHING
  `;
  const kochi = await prisma.region.findUniqueOrThrow({ where: { slug: "kochi" } });

  // A first slice of anchor destinations (DATA_STRATEGY.md §4.1).
  const anchors: Array<{ slug: string; name: string; kind: string; lat: number; lng: number }> = [
    { slug: "infopark-phase-1-kochi", name: "Infopark Phase 1", kind: "OFFICE_PARK", lat: 10.0134, lng: 76.3576 },
    { slug: "infopark-phase-2-kochi", name: "Infopark Phase 2", kind: "OFFICE_PARK", lat: 10.0286, lng: 76.3567 },
    { slug: "smartcity-kochi", name: "SmartCity Kochi", kind: "OFFICE_PARK", lat: 10.0435, lng: 76.3162 },
    { slug: "aster-medcity-kochi", name: "Aster Medcity", kind: "HOSPITAL", lat: 10.0303, lng: 76.3082 },
    { slug: "amrita-aims-kochi", name: "Amrita Institute (AIMS)", kind: "HOSPITAL", lat: 10.0387, lng: 76.2946 },
    { slug: "cusat-kalamassery", name: "CUSAT", kind: "COLLEGE", lat: 10.0466, lng: 76.3178 },
    { slug: "vyttila-mobility-hub", name: "Vyttila Mobility Hub", kind: "STATION", lat: 9.9679, lng: 76.3186 },
    { slug: "ernakulam-junction", name: "Ernakulam Junction (South)", kind: "STATION", lat: 9.9685, lng: 76.2946 },
  ];

  for (const a of anchors) {
    const destId = `dest_${cuidLike(a.slug)}`;
    await prisma.$executeRaw`
      INSERT INTO "destination" ("id", "slug", "name", "kind", "regionId", "location", "isAnchor")
      VALUES (
        ${destId}, ${a.slug}, ${a.name}, ${a.kind}, ${kochi.id},
        ST_SetSRID(ST_MakePoint(${a.lng}, ${a.lat}), 4326)::geography, true
      )
      ON CONFLICT ("slug") DO NOTHING
    `;
  }
  console.log(`Seeded ${anchors.length} anchor destinations in Kochi`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
