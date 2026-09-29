import { neon } from "@neondatabase/serverless";
import { setGlobalDispatcher, ProxyAgent } from "undici";

/**
 * Clearly-labelled SAMPLE listings so a fresh deployment is usable and
 * demo-able before real, phone-verified listings exist. Every row is
 * marked `attributes.sample = true` (the UI shows a "Sample listing"
 * badge and a banner on the detail page), its price provenance is
 * IMPORTED/LOW confidence with an explicit note, and it comes from a
 * dedicated `sample_demo` data source — so it can be found and removed in
 * one query once real data replaces it:
 *
 *   DELETE FROM place WHERE attributes->>'sample' = 'true';
 *
 * Same HTTP-only transport as the other scripts here (see
 * deploy-migrations-via-http.mjs). Idempotent: safe to re-run.
 */

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy));
}
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL");

const NOTE = "SAMPLE listing for demonstration — not a real, verified place or price.";

function cuidLike(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash.toString(36).padStart(8, "0");
}

// [slug, name, lat, lng, kind, gender, foodIncluded, landmark, rooms: [occupancy, ac, privateBath, rent₹, deposit₹]]
const STAYS = [
  ["sample-palm-grove-pg-kakkanad", "Palm Grove PG", 10.0171, 76.3531, "PG", "MEN", true, "Kakkanad Junction", [["DOUBLE", false, true, 6500, 13000], ["SINGLE", true, true, 9500, 19000]]],
  ["sample-lotus-ladies-hostel-infopark", "Lotus Ladies Hostel", 10.0102, 76.3622, "HOSTEL", "WOMEN", true, "Infopark Phase 1 gate", [["TRIPLE", false, false, 5200, 10400], ["DOUBLE", false, true, 6800, 13600]]],
  ["sample-techie-nest-coliving", "Techie Nest Co-living", 10.0205, 76.3598, "COLIVING", "ANY", false, "Chittethukara", [["SINGLE", true, true, 12500, 25000], ["DOUBLE", true, true, 8500, 17000]]],
  ["sample-green-valley-rooms", "Green Valley Rooms", 10.0258, 76.3489, "ROOM_RENTAL", "ANY", false, "Thengode", [["SINGLE", false, true, 7000, 21000]]],
  ["sample-infopark-2-residency", "Phase Two Residency", 10.0301, 76.3602, "PG", "MEN", true, "Infopark Phase 2", [["DOUBLE", true, true, 8200, 16400], ["TRIPLE", false, false, 5800, 11600]]],
  ["sample-smartcity-stay", "SmartCity Stay", 10.0461, 76.3198, "PG", "ANY", false, "SmartCity gate", [["SINGLE", true, true, 10500, 21000], ["DOUBLE", false, true, 7200, 14400]]],
  ["sample-edachira-womens-pg", "Edachira Women's PG", 10.0412, 76.3251, "PG", "WOMEN", true, "Edachira", [["DOUBLE", false, true, 6900, 13800]]],
  ["sample-medcity-bystander-rooms", "Medcity Bystander Rooms", 10.0321, 76.3059, "LODGE", "ANY", false, "Aster Medcity", [["DOUBLE", false, true, 900, 0, "PER_NIGHT"], ["SINGLE", true, true, 1400, 0, "PER_NIGHT"]]],
  ["sample-cheranalloor-family-stay", "Cheranalloor Family Stay", 10.0268, 76.3021, "SERVICE_APARTMENT", "FAMILY", false, "Cheranalloor", [["WHOLE_UNIT", true, true, 18000, 36000]]],
  ["sample-aims-comfort-lodge", "AIMS Comfort Lodge", 10.0401, 76.2921, "LODGE", "ANY", false, "Amrita Hospital", [["DOUBLE", false, true, 850, 0, "PER_NIGHT"], ["SINGLE", true, true, 1300, 0, "PER_NIGHT"]]],
  ["sample-edappally-mens-hostel", "Edappally Men's Hostel", 10.0254, 76.3102, "HOSTEL", "MEN", true, "Edappally Toll", [["DORM_4PLUS", false, false, 3800, 7600], ["TRIPLE", false, false, 4600, 9200]]],
  ["sample-cusat-scholars-hostel", "Scholars Hostel", 10.0481, 76.3159, "HOSTEL", "MEN", true, "CUSAT south gate", [["TRIPLE", false, false, 4200, 8400], ["DOUBLE", false, true, 5600, 11200]]],
  ["sample-kalamassery-girls-pg", "Kalamassery Girls PG", 10.0512, 76.3206, "PG", "WOMEN", true, "Kalamassery HMT Jn", [["DOUBLE", false, true, 6100, 12200]]],
  ["sample-vyttila-hub-rooms", "Hub Rooms Vyttila", 9.9703, 76.3171, "ROOM_RENTAL", "ANY", false, "Vyttila Mobility Hub", [["SINGLE", true, true, 9800, 29400], ["DOUBLE", false, true, 6700, 20100]]],
  ["sample-kadavanthra-coliving", "Kadavanthra Co-living", 9.9662, 76.3009, "COLIVING", "ANY", false, "Kadavanthra", [["SINGLE", true, true, 13500, 27000]]],
  ["sample-south-station-lodge", "South Station Lodge", 9.9701, 76.2931, "LODGE", "ANY", false, "Ernakulam South", [["DOUBLE", false, true, 1100, 0, "PER_NIGHT"]]],
];

// [slug, name, lat, lng, kind, vegOnly, delivers, meals, price₹, basis]
const FOOD = [
  ["sample-annapoorna-mess-kakkanad", "Annapoorna Mess", 10.0162, 76.3552, "MESS", true, false, ["BREAKFAST", "LUNCH", "DINNER"], 3200, "PER_MONTH"],
  ["sample-kerala-kitchen-tiffin", "Kerala Kitchen Tiffins", 10.0121, 76.3604, "TIFFIN", false, true, ["LUNCH", "DINNER"], 3600, "PER_MONTH"],
  ["sample-infopark-bowl-co", "Bowl Co. Cloud Kitchen", 10.0145, 76.3585, "CLOUD_KITCHEN", false, true, ["LUNCH", "DINNER"], 140, "PER_MEAL"],
  ["sample-phase2-canteen-mess", "Phase 2 Canteen Mess", 10.0293, 76.3581, "MESS", false, false, ["LUNCH", "DINNER"], 2800, "PER_MONTH"],
  ["sample-smartcity-meals", "SmartCity Meals", 10.0449, 76.3181, "RESTAURANT", false, false, ["LUNCH", "DINNER"], 120, "PER_MEAL"],
  ["sample-medcity-home-food", "Medcity Home Food", 10.0311, 76.3071, "TIFFIN", true, true, ["BREAKFAST", "LUNCH", "DINNER"], 150, "PER_DAY"],
  ["sample-aims-bystander-canteen", "Bystander Canteen", 10.0392, 76.2939, "MESS", true, false, ["BREAKFAST", "LUNCH", "DINNER"], 130, "PER_DAY"],
  ["sample-cusat-students-mess", "Students' Mess", 10.0472, 76.3169, "MESS", false, false, ["BREAKFAST", "LUNCH", "DINNER"], 2600, "PER_MONTH"],
  ["sample-vyttila-tiffin-box", "Tiffin Box Vyttila", 9.9689, 76.3179, "TIFFIN", false, true, ["LUNCH", "DINNER"], 3400, "PER_MONTH"],
  ["sample-ernakulam-veg-mess", "Ernakulam Veg Mess", 9.9679, 76.2952, "MESS", true, false, ["LUNCH", "DINNER"], 2900, "PER_MONTH"],
];

const query = neon(DATABASE_URL);
const q = (text, params = []) => query.query(text, params);

const [region] = await q(`SELECT id FROM region WHERE slug = 'kochi'`);
if (!region) throw new Error("Run the base seed first (no 'kochi' region).");

const sourceId = `src_${cuidLike("sample_demo")}`;
await q(
  `INSERT INTO data_source (id, key, name, kind, "licenceNote", "trustedAutoPublish", enabled)
   VALUES ($1, 'sample_demo', 'Sample demo listings', 'SAMPLE', $2, false, true)
   ON CONFLICT (key) DO NOTHING`,
  [sourceId, NOTE],
);
const [source] = await q(`SELECT id FROM data_source WHERE key = 'sample_demo'`);

async function insertPlace(slug, name, lat, lng, category, landmark) {
  const id = `place_${cuidLike(slug)}`;
  await q(
    `INSERT INTO place (id, slug, category, name, "regionId", location, "addressLine", landmark, status, attributes, "updatedAt")
     VALUES ($1, $2, $3::"PlaceCategory", $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
             $8, $9, 'PUBLISHED', '{"sample": true}'::jsonb, now())
     ON CONFLICT (slug) DO NOTHING`,
    [id, slug, category, name, region.id, lng, lat, `Sample address near ${landmark}, Kochi`, landmark],
  );
  const [row] = await q(`SELECT id FROM place WHERE slug = $1`, [slug]);
  return row.id;
}

async function provenance(placeId, factKey) {
  await q(
    `INSERT INTO fact_provenance (id, "placeId", "factKey", "sourceType", "dataSourceId", "observedAt", confidence, note)
     SELECT $1, $2, $3, 'IMPORTED', $4, now(), 'LOW', $5
     WHERE NOT EXISTS (SELECT 1 FROM fact_provenance WHERE "placeId" = $2 AND "factKey" = $3)`,
    [`prov_${cuidLike(placeId + factKey)}`, placeId, factKey, source.id, NOTE],
  );
}

for (const [slug, name, lat, lng, kind, gender, foodIncluded, landmark, rooms] of STAYS) {
  const placeId = await insertPlace(slug, name, lat, lng, "ACCOMMODATION", landmark);
  await q(
    `INSERT INTO accommodation_detail ("placeId", kind, "genderPolicy", "foodIncluded", "mealsIncluded", "noticeDays", rules)
     VALUES ($1, $2::"AccommodationKind", $3::"GenderPolicy", $4, $5, 30, $6)
     ON CONFLICT ("placeId") DO NOTHING`,
    [placeId, kind, gender, foodIncluded, foodIncluded ? ["BREAKFAST", "DINNER"] : [], "Sample house rules: no smoking indoors; visitors until 9pm."],
  );
  for (const [i, [occupancy, ac, privateBath, rent, deposit, basis = "PER_MONTH"]] of rooms.entries()) {
    const roomId = `room_${cuidLike(`${slug}-${i}`)}`;
    await q(
      `INSERT INTO room_option (id, "placeId", occupancy, ac, "privateBath", "priceBasis", "pricePaise", "depositPaise", "availableBeds")
       VALUES ($1, $2, $3::"Occupancy", $4, $5, $6::"PriceBasis", $7, $8, 2)
       ON CONFLICT (id) DO NOTHING`,
      [roomId, placeId, occupancy, ac, privateBath, basis, rent * 100, deposit > 0 ? deposit * 100 : null],
    );
    await provenance(placeId, `room:${roomId}:price`);
  }
}
console.log(`Seeded ${STAYS.length} sample stays`);

for (const [slug, name, lat, lng, kind, vegOnly, delivers, meals, price, basis] of FOOD) {
  const placeId = await insertPlace(slug, name, lat, lng, "FOOD", name);
  const foodId = `food_${cuidLike(slug)}`;
  await q(
    `INSERT INTO food_plan (id, "placeId", kind, meals, "vegOnly", "priceBasis", "pricePaise", delivers)
     VALUES ($1, $2, $3::"FoodKind", $4, $5, $6::"PriceBasis", $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [foodId, placeId, kind, meals, vegOnly, basis, price * 100, delivers],
  );
  await provenance(placeId, `food:${foodId}:price`);
}
console.log(`Seeded ${FOOD.length} sample food places`);

// Placeholder assumptions so budgets include food and auto-commute lines.
// LOW confidence and explicitly labelled — replace with real survey data.
await q(
  `INSERT INTO cost_assumption (id, key, "regionId", "valuePaise", "p25Paise", "p75Paise", unit, "effectiveFrom", "sourceNote", confidence)
   VALUES ('sample_ca_food_mess_2meals', 'food.mess.2meals.monthly', $1, 300000, 250000, 350000, 'INR/month', now(), $2, 'LOW')
   ON CONFLICT (id) DO NOTHING`,
  [region.id, `PLACEHOLDER pending Livo cost survey. ${NOTE}`],
);
await q(
  `INSERT INTO fare_rule (id, "regionId", mode, params, "effectiveFrom", "sourceNote")
   VALUES ('sample_fr_auto', $1, 'AUTO', '{"minFarePaise":"3000","minKm":1.5,"perKmPaise":"1500"}'::jsonb, now(), $2)
   ON CONFLICT (id) DO NOTHING`,
  [region.id, `PLACEHOLDER pending current Kerala auto fare notification. ${NOTE}`],
);
console.log("Seeded placeholder cost assumption + auto fare rule");
