import { neon } from "@neondatabase/serverless";
import { setGlobalDispatcher, ProxyAgent } from "undici";

/**
 * One-off equivalent of prisma/seed.ts for an environment that can only
 * reach the database over plain HTTPS (see deploy-migrations-via-http.mjs
 * for why). Mirrors the same data and the same idempotent
 * upsert/ON-CONFLICT semantics — not a permanent replacement for
 * `pnpm db:seed`, which remains the source of truth for what gets seeded;
 * keep this in sync with prisma/seed.ts if that file changes.
 */

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy));
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL");

function cuidLike(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash.toString(36).padStart(8, "0");
}

const ROLE_PERMISSIONS = {
  super_admin: [
    "dashboard:view", "places:read", "places:create", "places:update", "places:verify", "places:publish",
    "places:merge", "data:assumptions", "data:read", "data:sync", "jobs:read", "jobs:retry", "reports:read",
    "reports:resolve", "users:read", "users:pii", "users:suspend", "guests:read", "ai:read", "flags:manage",
    "roles:manage", "audit:read", "system:read", "settings:manage",
  ],
  admin: [
    "dashboard:view", "places:read", "places:create", "places:update", "places:verify", "places:publish",
    "places:merge", "data:assumptions", "data:read", "data:sync", "jobs:read", "jobs:retry", "reports:read",
    "reports:resolve", "users:read", "users:pii", "users:suspend", "guests:read", "ai:read", "flags:manage",
    "audit:read", "system:read",
  ],
  moderator: ["dashboard:view", "places:read", "reports:read", "reports:resolve", "users:read", "users:suspend"],
  data_manager: [
    "dashboard:view", "places:read", "places:create", "places:update", "places:verify", "places:publish",
    "places:merge", "data:assumptions", "data:read", "data:sync", "jobs:read", "jobs:retry", "reports:read",
    "reports:resolve", "ai:read",
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
  { key: "livo_survey", name: "Livo cost survey", kind: "SURVEY", licenceNote: "Livo first-party research" },
];

const ANCHORS = [
  { slug: "infopark-phase-1-kochi", name: "Infopark Phase 1", kind: "OFFICE_PARK", lat: 10.0134, lng: 76.3576 },
  { slug: "infopark-phase-2-kochi", name: "Infopark Phase 2", kind: "OFFICE_PARK", lat: 10.0286, lng: 76.3567 },
  { slug: "smartcity-kochi", name: "SmartCity Kochi", kind: "OFFICE_PARK", lat: 10.0435, lng: 76.3162 },
  { slug: "aster-medcity-kochi", name: "Aster Medcity", kind: "HOSPITAL", lat: 10.0303, lng: 76.3082 },
  { slug: "amrita-aims-kochi", name: "Amrita Institute (AIMS)", kind: "HOSPITAL", lat: 10.0387, lng: 76.2946 },
  { slug: "cusat-kalamassery", name: "CUSAT", kind: "COLLEGE", lat: 10.0466, lng: 76.3178 },
  { slug: "vyttila-mobility-hub", name: "Vyttila Mobility Hub", kind: "STATION", lat: 9.9679, lng: 76.3186 },
  { slug: "ernakulam-junction", name: "Ernakulam Junction (South)", kind: "STATION", lat: 9.9685, lng: 76.2946 },
];

const query = neon(DATABASE_URL);

for (const [key, permissions] of Object.entries(ROLE_PERMISSIONS)) {
  const name = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const roleId = `role_${cuidLike(key)}`;
  await query.query(
    `INSERT INTO "role" ("id", "key", "name") VALUES ($1, $2, $3) ON CONFLICT ("key") DO NOTHING`,
    [roleId, key, name],
  );
  const [role] = await query.query(`SELECT "id" FROM "role" WHERE "key" = $1`, [key]);
  for (const permission of permissions) {
    await query.query(
      `INSERT INTO "role_permission" ("roleId", "permission") VALUES ($1, $2) ON CONFLICT ("roleId", "permission") DO NOTHING`,
      [role.id, permission],
    );
  }
}
console.log(`Seeded ${Object.keys(ROLE_PERMISSIONS).length} roles`);

for (const a of AMENITIES) {
  await query.query(
    `INSERT INTO "amenity" ("id", "key", "label") VALUES ($1, $2, $3) ON CONFLICT ("key") DO NOTHING`,
    [`amn_${cuidLike(a.key)}`, a.key, a.label],
  );
}
console.log(`Seeded ${AMENITIES.length} amenities`);

for (const s of DATA_SOURCES) {
  await query.query(
    `INSERT INTO "data_source" ("id", "key", "name", "kind", "licenceNote", "attribution")
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT ("key") DO NOTHING`,
    [`src_${cuidLike(s.key)}`, s.key, s.name, s.kind, s.licenceNote, s.attribution ?? null],
  );
}
console.log(`Seeded ${DATA_SOURCES.length} data sources`);

const kochiId = `reg_${cuidLike("kochi")}`;
await query.query(
  `INSERT INTO "region" ("id", "kind", "slug", "name", "centroid")
   VALUES ($1, 'CITY', 'kochi', 'Kochi', ST_SetSRID(ST_MakePoint(76.2673, 9.9312), 4326)::geography)
   ON CONFLICT ("slug") DO NOTHING`,
  [kochiId],
);
const [kochi] = await query.query(`SELECT "id" FROM "region" WHERE "slug" = 'kochi'`);

for (const a of ANCHORS) {
  await query.query(
    `INSERT INTO "destination" ("id", "slug", "name", "kind", "regionId", "location", "isAnchor")
     VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography, true)
     ON CONFLICT ("slug") DO NOTHING`,
    [`dest_${cuidLike(a.slug)}`, a.slug, a.name, a.kind, kochi.id, a.lng, a.lat],
  );
}
console.log(`Seeded ${ANCHORS.length} anchor destinations in Kochi`);
