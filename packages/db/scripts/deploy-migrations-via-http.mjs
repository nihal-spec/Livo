import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setGlobalDispatcher, ProxyAgent } from "undici";

// Node's native fetch (undici under the hood) does NOT automatically
// honor HTTPS_PROXY the way curl and most other tools do — it has to be
// wired up explicitly, or requests go out directly and hit whatever
// happens on the other side of that (in the sandbox this was written for,
// a transparent network-level deny that returns a look-alike "Host not in
// allowlist" 403, easy to mistake for the real proxy's own denial).
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy));
}

/**
 * Fallback for `prisma migrate deploy` in an environment that can only
 * reach the outside world over plain HTTPS — no raw Postgres wire
 * protocol on port 5432, and no WebSocket upgrades either (both were
 * blocked in the sandbox this was written for; only a plain HTTPS
 * POST got through). Neon's HTTP-over-fetch driver (`neon()`, not the
 * WebSocket-based `Pool`) works under that constraint, since it really is
 * just an ordinary fetch() call per statement.
 *
 * This applies every *.sql file under prisma/migrations/, in directory
 * order, splitting each file into individual statements. It's a stand-in
 * for `prisma migrate deploy`, not a replacement — prefer the real CLI
 * (`pnpm db:migrate:deploy`) whenever the environment running it has a
 * normal Postgres connection. This script mimics only what that command's
 * SQL side does: it does not do Prisma's own migration-history diffing,
 * just applies each migration's SQL once, marking it in
 * `_prisma_migrations` so a subsequent real `prisma migrate deploy` sees
 * it as already applied and doesn't try to redo it.
 */

const dbDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(dbDir, "prisma", "migrations");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("Set DATABASE_URL");

function splitStatements(sql) {
  // Split on a semicolon at the end of a line. Strips comment lines
  // (e.g. Prisma's own "-- CreateTable") from within each chunk rather
  // than discarding the whole chunk, since a comment line directly
  // precedes the real statement it documents, not a separate one.
  // Only safe for pure-DDL migrations with no function bodies or
  // dollar-quoted blocks (semicolons inside those would be split too) —
  // check for those before trusting this on a new migration file.
  return sql
    .split(/;\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const query = neon(DATABASE_URL);

await query.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                      VARCHAR(36) PRIMARY KEY,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
  );
`);

for (const name of migrationDirs) {
  const [{ count }] = await query.query(
    `SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL`,
    [name],
  );
  if (count > 0) {
    console.log(`${name}: already applied, skipping`);
    continue;
  }

  const sql = readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");
  const statements = splitStatements(sql);
  console.log(`${name}: applying ${statements.length} statements`);
  for (const [i, stmt] of statements.entries()) {
    process.stdout.write(`  [${i + 1}/${statements.length}] ${stmt.slice(0, 60).replace(/\s+/g, " ")}...`);
    await query.query(stmt);
    console.log(" ok");
  }

  await query.query(
    `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, 'manual-http-apply', now(), $1, now(), $2)`,
    [name, statements.length],
  );
  console.log(`${name}: marked applied`);
}

console.log("\nDone.");
