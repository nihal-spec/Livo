import { PrismaClient } from "@prisma/client";

/**
 * DEV-ONLY seed: synthetic accommodation listings and placeholder cost
 * assumptions/fare rules, so search and the budget engine have something
 * to exercise locally. NEVER run this against a production database.
 *
 * Every row here is clearly marked so it can never be mistaken for real,
 * ops-verified data (DATA_STRATEGY.md §1 principle: "AI must never invent
 * real-world prices" — the same bar applies to this seed data, which is why
 * it is sourceType IMPORTED/ESTIMATED with confidence LOW and an explicit
 * "SYNTHETIC" note, kept out of prisma/seed.ts, and never runs in CI's
 * `migrate deploy` path).
 */
const prisma = new PrismaClient();

function cuidLike(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash.toString(36).padStart(8, "0");
}

const SYNTHETIC_NOTE = "SYNTHETIC seed data for local development only — not a real listing or price.";

interface SyntheticListing {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  genderPolicy: "MEN" | "WOMEN" | "ANY";
  foodIncluded: boolean;
  occupancy: "SINGLE" | "DOUBLE" | "TRIPLE";
  ac: boolean;
  privateBath: boolean;
  pricePaise: bigint;
  depositPaise: bigint;
}

// Roughly scattered around Infopark Phase 1 (10.0134, 76.3576), within ~1-6km.
const LISTINGS: SyntheticListing[] = [
  { slug: "dev-pg-kakkanad-1", name: "[DEV] Green Nest PG", lat: 10.0180, lng: 76.3520, genderPolicy: "MEN", foodIncluded: true, occupancy: "DOUBLE", ac: false, privateBath: true, pricePaise: 650_000n, depositPaise: 1_300_000n },
  { slug: "dev-pg-kakkanad-2", name: "[DEV] Sunrise Ladies Hostel", lat: 10.0090, lng: 76.3610, genderPolicy: "WOMEN", foodIncluded: true, occupancy: "TRIPLE", ac: false, privateBath: false, pricePaise: 550_000n, depositPaise: 1_100_000n },
  { slug: "dev-pg-kakkanad-3", name: "[DEV] Infopark Comforts", lat: 10.0150, lng: 76.3600, genderPolicy: "ANY", foodIncluded: false, occupancy: "SINGLE", ac: true, privateBath: true, pricePaise: 950_000n, depositPaise: 1_900_000n },
  { slug: "dev-pg-thrikkakara-1", name: "[DEV] Thrikkakara Stay Inn", lat: 10.0410, lng: 76.3350, genderPolicy: "MEN", foodIncluded: false, occupancy: "DOUBLE", ac: false, privateBath: false, pricePaise: 480_000n, depositPaise: 960_000n },
  { slug: "dev-pg-edappally-1", name: "[DEV] Edappally Executive PG", lat: 10.0230, lng: 76.3080, genderPolicy: "ANY", foodIncluded: true, occupancy: "SINGLE", ac: true, privateBath: true, pricePaise: 1_100_000n, depositPaise: 2_200_000n },
  { slug: "dev-pg-kalamassery-1", name: "[DEV] Kalamassery Budget Rooms", lat: 10.0500, lng: 76.3200, genderPolicy: "MEN", foodIncluded: false, occupancy: "TRIPLE", ac: false, privateBath: false, pricePaise: 400_000n, depositPaise: 800_000n },
];

interface SyntheticFoodListing {
  slug: string;
  name: string;
  lat: number;
  lng: number;
  kind: "MESS" | "TIFFIN" | "RESTAURANT" | "CLOUD_KITCHEN" | "MEAL_SUBSCRIPTION";
  vegOnly: boolean;
  delivers: boolean;
  meals: string[];
  priceBasis: "PER_MEAL" | "PER_MONTH";
  pricePaise: bigint;
}

// Scattered around the same Infopark/Kakkanad area as the accommodation fixtures above.
const FOOD_LISTINGS: SyntheticFoodListing[] = [
  { slug: "dev-mess-kakkanad-1", name: "[DEV] Amma's Kitchen Mess", lat: 10.0160, lng: 76.3540, kind: "MESS", vegOnly: true, delivers: false, meals: ["LUNCH", "DINNER"], priceBasis: "PER_MONTH", pricePaise: 280_000n },
  { slug: "dev-tiffin-kakkanad-1", name: "[DEV] Kochi Tiffin Service", lat: 10.0095, lng: 76.3595, kind: "TIFFIN", vegOnly: false, delivers: true, meals: ["BREAKFAST", "LUNCH"], priceBasis: "PER_MONTH", pricePaise: 320_000n },
  { slug: "dev-cloudkitchen-infopark-1", name: "[DEV] Infopark Cloud Kitchen", lat: 10.0140, lng: 76.3590, kind: "CLOUD_KITCHEN", vegOnly: false, delivers: true, meals: ["LUNCH", "DINNER"], priceBasis: "PER_MEAL", pricePaise: 12_000n },
  { slug: "dev-restaurant-thrikkakara-1", name: "[DEV] Thrikkakara Family Restaurant", lat: 10.0400, lng: 76.3360, kind: "RESTAURANT", vegOnly: false, delivers: false, meals: ["LUNCH", "DINNER"], priceBasis: "PER_MEAL", pricePaise: 15_000n },
  { slug: "dev-mess-edappally-1", name: "[DEV] Edappally Veg Mess", lat: 10.0225, lng: 76.3090, kind: "MESS", vegOnly: true, delivers: false, meals: ["BREAKFAST", "LUNCH", "DINNER"], priceBasis: "PER_MONTH", pricePaise: 260_000n },
];

async function main() {
  const region = await prisma.region.findUniqueOrThrow({ where: { slug: "kochi" } });
  const devDataSource = await prisma.dataSource.upsert({
    where: { key: "dev_synthetic" },
    update: {},
    create: {
      key: "dev_synthetic",
      name: "Synthetic dev fixtures",
      kind: "SYNTHETIC",
      licenceNote: SYNTHETIC_NOTE,
      trustedAutoPublish: false,
      enabled: true,
    },
  });

  for (const l of LISTINGS) {
    const placeId = `place_${cuidLike(l.slug)}`;
    await prisma.$executeRaw`
      INSERT INTO "place" ("id", "slug", "category", "name", "regionId", "location", "addressLine", "status", "attributes", "updatedAt")
      VALUES (
        ${placeId}, ${l.slug}, 'ACCOMMODATION', ${l.name}, ${region.id},
        ST_SetSRID(ST_MakePoint(${l.lng}, ${l.lat}), 4326)::geography,
        'Synthetic dev address', 'PUBLISHED', ${JSON.stringify({ synthetic: true })}::jsonb, now()
      )
      ON CONFLICT ("id") DO NOTHING
    `;

    await prisma.accommodationDetail.upsert({
      where: { placeId },
      update: {},
      create: {
        placeId,
        kind: "PG",
        genderPolicy: l.genderPolicy,
        foodIncluded: l.foodIncluded,
        mealsIncluded: l.foodIncluded ? ["BREAKFAST", "LUNCH", "DINNER"] : [],
      },
    });

    const roomId = `room_${cuidLike(l.slug)}`;
    await prisma.roomOption.upsert({
      where: { id: roomId },
      update: {},
      create: {
        id: roomId,
        placeId,
        occupancy: l.occupancy,
        ac: l.ac,
        privateBath: l.privateBath,
        priceBasis: "PER_MONTH",
        pricePaise: l.pricePaise,
        depositPaise: l.depositPaise,
        availableBeds: 2,
      },
    });

    await prisma.factProvenance.create({
      data: {
        placeId,
        factKey: `room:${roomId}:price`,
        sourceType: "IMPORTED",
        dataSourceId: devDataSource.id,
        observedAt: new Date(),
        confidence: "LOW",
        note: SYNTHETIC_NOTE,
      },
    });
  }
  console.log(`Seeded ${LISTINGS.length} synthetic accommodation listings`);

  for (const f of FOOD_LISTINGS) {
    const placeId = `place_${cuidLike(f.slug)}`;
    await prisma.$executeRaw`
      INSERT INTO "place" ("id", "slug", "category", "name", "regionId", "location", "addressLine", "status", "attributes", "updatedAt")
      VALUES (
        ${placeId}, ${f.slug}, 'FOOD', ${f.name}, ${region.id},
        ST_SetSRID(ST_MakePoint(${f.lng}, ${f.lat}), 4326)::geography,
        'Synthetic dev address', 'PUBLISHED', ${JSON.stringify({ synthetic: true })}::jsonb, now()
      )
      ON CONFLICT ("id") DO NOTHING
    `;

    const foodPlanId = `food_${cuidLike(f.slug)}`;
    await prisma.foodPlan.upsert({
      where: { id: foodPlanId },
      update: {},
      create: {
        id: foodPlanId,
        placeId,
        kind: f.kind,
        meals: f.meals,
        vegOnly: f.vegOnly,
        priceBasis: f.priceBasis,
        pricePaise: f.pricePaise,
        delivers: f.delivers,
      },
    });

    await prisma.factProvenance.create({
      data: {
        placeId,
        factKey: `food:${foodPlanId}:price`,
        sourceType: "IMPORTED",
        dataSourceId: devDataSource.id,
        observedAt: new Date(),
        confidence: "LOW",
        note: SYNTHETIC_NOTE,
      },
    });
  }
  console.log(`Seeded ${FOOD_LISTINGS.length} synthetic food listings`);

  // Placeholder cost assumptions (DATA_STRATEGY.md §5) — LOW confidence,
  // explicitly not from a real survey. Replace with real Livo survey data
  // before any of this is shown to a real user.
  await prisma.costAssumption.upsert({
    where: { id: "dev_ca_food_mess_2meals" },
    update: {},
    create: {
      id: "dev_ca_food_mess_2meals",
      key: "food.mess.2meals.monthly",
      regionId: region.id,
      valuePaise: 300_000n,
      p25Paise: 250_000n,
      p75Paise: 350_000n,
      unit: "INR/month",
      effectiveFrom: new Date(),
      sourceNote: `PLACEHOLDER pending Livo cost survey (DATA_STRATEGY.md §5). ${SYNTHETIC_NOTE}`,
      confidence: "LOW",
    },
  });

  await prisma.fareRule.upsert({
    where: { id: "dev_fr_auto" },
    update: {},
    create: {
      id: "dev_fr_auto",
      regionId: region.id,
      mode: "AUTO",
      params: { minFarePaise: "3000", minKm: 1.5, perKmPaise: "1500" },
      effectiveFrom: new Date(),
      sourceNote: `PLACEHOLDER pending current Kerala auto fare notification. ${SYNTHETIC_NOTE}`,
    },
  });
  console.log("Seeded placeholder cost assumption + fare rule");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
