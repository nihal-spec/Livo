import { config } from "dotenv";
import { resolve } from "node:path";

// Integration tests need DATABASE_URL pointing at a real Postgres+PostGIS
// instance. Loaded explicitly here since vitest doesn't read .env by default.
config({ path: resolve(import.meta.dirname, ".env") });
