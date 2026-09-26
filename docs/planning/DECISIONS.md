# Livo — Architecture Decision Records

Status legend: **Accepted** (build this), **Proposed** (default, revisit at the named trigger), **Deferred** (explicitly not now).

Each ADR follows: Context → Options → Decision → Reason → Trade-offs → Revisit trigger.

---

## ADR-001 Modular monolith vs microservices — Accepted

**Context.** Greenfield repo (empty at planning time), a team of 1–3 developers, one city, unproven demand. Domains (search, plans, budget, AI, admin, ingestion) are distinct but share one database and are called together inside single user requests.

**Options.** (a) Microservices per domain. (b) Modular monolith in one Next.js app with domain modules. (c) Next.js frontend + separate backend (NestJS/Fastify) monolith.

**Decision.** (b) Modular monolith: one Next.js (App Router) deployable for web + API + admin, plus **one separate worker process** (same repo, same domain code) for background jobs and routing precomputation.

**Reason.** Lowest operational cost; atomic refactors across domains; one deploy pipeline. The only workload that genuinely needs a different runtime is long-running jobs, which the worker covers.

**Trade-offs.** Discipline required to keep module boundaries (enforced with `eslint-plugin-boundaries` / dependency-cruiser rules: modules may only import each other's `index.ts` public API). Serverless cold starts on Vercel for API routes.

**Revisit when.** A module needs independent scaling or a different language (e.g., routing engine — already out-of-process as OSRM/Valhalla container), or team > ~8 engineers with ownership conflicts.

---

## ADR-002 PostgreSQL + PostGIS as primary store — Accepted

**Context.** Core queries are "listings within X km / Y minutes of a destination, filtered by price/type/amenities, sorted by cost or distance". Need relational integrity for plans, budgets, RBAC, audit.

**Options.** (a) Postgres + PostGIS. (b) MongoDB with geo indexes. (c) Postgres + external search (Elasticsearch/OpenSearch/Typesense).

**Decision.** (a). Use `geography(Point,4326)` columns with GiST indexes; `ST_DWithin` for radius, `<->` KNN for nearest; precomputed travel-time table for time-based filters.

**Reason.** One system of record; PostGIS is the industry standard; at MVP scale (≤ 10k listings) Postgres handles filtering + geo in < 50 ms with correct indexes.

**Trade-offs.** Full-text fuzzy search in Postgres (`pg_trgm`, `tsvector`) is weaker than a dedicated engine for typo-tolerant, multi-language search. Acceptable for MVP (users mostly search by destination, not listing name).

**Revisit when.** > 100k listings across many cities, or search p95 > 300 ms after index tuning, or Malayalam/Hindi fuzzy search becomes important → evaluate Typesense/OpenSearch fed via outbox.

---

## ADR-003 Prisma as ORM (with raw SQL for geo) — Accepted

**Context.** Brief prefers Prisma. Prisma has no native PostGIS types.

**Options.** (a) Prisma everywhere, geo via `Unsupported("geography(Point,4326)")` + TypedSQL/`$queryRaw`. (b) Drizzle ORM (better custom types, SQL-first). (c) Kysely (query builder only).

**Decision.** (a) Prisma for schema, migrations and CRUD. All geo queries live in **repository files** under `modules/*/repository/*.sql.ts` using Prisma TypedSQL (`prisma/sql/*.sql`) so they are typed and reviewed; PostGIS columns and GiST indexes are added in hand-edited migration SQL.

**Reason.** Team familiarity and brief preference; Prisma migrations + Studio speed up admin-heavy early work. Geo queries are a small, well-bounded set (≈ 6 queries).

**Trade-offs.** Two query styles. `Unsupported` columns cannot be read via normal Prisma client calls — reads go through the repository. Drizzle would avoid this; recorded as the fallback if the raw-SQL surface grows beyond ~20 queries.

---

## ADR-004 Background jobs: pg-boss now, Redis/BullMQ later — Accepted (deviates from brief)

**Context.** Brief suggests Redis + BullMQ. Hosting is Vercel (serverless). BullMQ requires a persistent Node worker and a Redis with persistence (not purely HTTP Redis). MVP job volume: nightly travel-matrix precompute, freshness sweeps, image processing, a few emails — hundreds to low thousands of jobs/day.

**Options.** (a) Redis + BullMQ with a worker on Railway/Fly/Render. (b) **pg-boss** (Postgres-backed queue, `SKIP LOCKED`) with the same worker. (c) Vercel Cron + route handlers only. (d) Managed queues (Inngest, Trigger.dev, QStash).

**Decision.** (b) pg-boss in a small always-on worker container (Railway / Fly.io / Render, Mumbai or Singapore region), plus Vercel Cron to enqueue scheduled jobs. **Upstash Redis** (HTTP) is used only for rate limiting and hot caches.

**Reason.** One fewer stateful system; transactional enqueue (job inserted in the same transaction as the domain change = free outbox); retries/backoff/cron/dead-letter supported.

**Trade-offs.** Adds load to Postgres (negligible at this volume). Fewer dashboards than BullMQ (build a minimal admin "Jobs" view reading pg-boss tables).

**Revisit when.** > ~50 jobs/sec sustained, or need for rate-limited fan-out to many external APIs → move to BullMQ on a persistent Redis. Job handlers are written behind a `JobQueue` interface so the swap is mechanical.

---

## ADR-005 Object storage: Cloudflare R2 + image CDN — Accepted

**Context.** Listing photos (admin uploads, later business/user uploads). Must not be stored in Postgres.

**Options.** (a) Cloudflare R2 + Cloudflare Images / `next/image` loader. (b) Cloudinary. (c) AWS S3 + CloudFront.

**Decision.** (a) R2 with **private bucket for originals**, public (or signed) derived variants served via a custom domain with Cloudflare caching. Uploads via short-lived presigned PUT URLs; server validates type/size and re-encodes (sharp in worker) to WebP/AVIF, strips EXIF (GPS).

**Reason.** Zero egress fees, S3-compatible API, cheap.

**Trade-offs.** Transform pipeline is ours to maintain (vs Cloudinary's turnkey transforms). Revisit if image ops take > 1 day/month of engineering time.

---

## ADR-006 Search: Postgres/PostGIS first — Accepted

**Context/Options.** Same as ADR-002 (c).

**Decision.** Search = PostGIS filter + precomputed `travel_estimate` join + deterministic ranking in TypeScript. No Elasticsearch/OpenSearch in MVP/V1.

**Reason.** Data volume is tiny; ranking logic needs full-cost computation (rent + food + commute) which lives in TS anyway.

**Revisit when.** see ADR-002.

---

## ADR-007 AI provider abstraction — Accepted

**Context.** Must support OpenAI / Gemini / Claude; AI is never the source of truth; needs structured output + tool calling.

**Options.** (a) Direct SDK per provider. (b) **Vercel AI SDK** (`ai` package) with provider adapters. (c) LangChain.

**Decision.** (b) Vercel AI SDK behind a thin in-house `llm` port:
`extract<T>(schema, prompt)`, `runToolLoop(tools, messages, limits)`, `explain(facts)`. Model selection is **config per task** (`intent_extraction`, `plan_explanation`, `chat`) not hardcoded. Default: a Claude model family (small/fast model for extraction, stronger model for planning chat) with an OpenAI or Gemini model as failover.

**Reason.** Unified structured output (Zod) and tool calling across providers with minimal abstraction weight; LangChain adds complexity without benefit here.

**Trade-offs.** Some provider-specific features (prompt caching knobs, citations) need escape hatches. Evals must run per provider before switching.

---

## ADR-008 Guest-first authentication — Accepted

**Context.** Users must search, compare, and build plans without an account; saving/sync needs an account.

**Options.** (a) Anonymous accounts in the auth provider (e.g., Supabase anon users). (b) **Own guest session** (signed, httpOnly cookie → `GuestSession` row) + Auth.js for real accounts. (c) Client-only localStorage plans.

**Decision.** (b). Guest cookie `livo_gs` (random 256-bit id, stored hashed in DB, 30-day sliding TTL). Plans are owned by `ownerUserId` **or** `guestSessionId` (exactly one; DB check constraint). On sign-in, a single transaction reassigns guest-owned plans to the user. Auth.js v5 with **Google OAuth + email magic link** (no passwords in MVP → no password storage, fewer brute-force vectors). Database sessions (not JWT) so sessions can be revoked.

**Reason.** Works across devices via share links, server-side budget/AI can access guest plans, simple merge semantics.

**Trade-offs.** Guest rows need cleanup (daily job deletes expired sessions + orphaned plans). Magic link depends on email deliverability.

---

## ADR-009 PWA-capable responsive web vs native apps — Accepted

**Decision.** Responsive web (mobile-first) in MVP; add PWA manifest + service worker (offline plan view, push) in V1. No native apps until V2+ and only if retention data shows repeated on-the-ground usage (expense tracking, daily commute).

**Reason.** Planning is episodic and research-heavy; SEO acquisition requires web; one codebase.

**Trade-offs.** iOS web push requires the PWA to be installed to the home screen (iOS 16.4+) — push is a weak channel on iOS; email remains primary.

---

## ADR-010 Map/geo provider abstraction — Accepted

**Context.** Google Maps Platform terms restrict caching of Places content and displaying Google content on non-Google maps. India pricing has an India-specific price list with generous free caps (≈ 70k free events/month for Geocoding, Autocomplete, Compute Routes Essentials as of 2026 — verify at build time). Indian alternatives exist (Ola Maps, Mappls/MapmyIndia). OSM data is ODbL-licensed and cacheable with attribution.

**Options.** Single vendor (Google end-to-end) vs split roles behind interfaces.

**Decision.** Four ports, each with a swappable adapter:

| Port | MVP adapter | Fallback |
|---|---|---|
| `TileProvider` (base map) | MapLibre GL + OSM-based vector tiles (MapTiler/Stadia hosted, or self-hosted Protomaps PMTiles on R2) | Google Maps JS (only if we switch display to Google everywhere) |
| `Geocoder` / `Autocomplete` (user destination input) | Google Places Autocomplete + Geocoding (India SKUs), storing only `place_id` + our own resolved coordinates within ToS limits | Ola Maps / Mappls / Nominatim (self-hosted) |
| `RoutingProvider` (drive/walk/two-wheeler time) | Self-hosted **OSRM or Valhalla** on the Kerala OSM extract (Geofabrik) | Google Routes API (Compute Route Matrix) |
| `TransitEstimator` (bus/metro) | Rule-based: Kochi Metro GTFS (if licence permits) + bus speed model + walk legs; fare tables | Google Routes transit mode |

**Reason.** Our own listing coordinates and computed travel times must be **cacheable and storable** (precomputed matrix) — Google Routes results generally are not. Tiles on MapLibre avoid per-load map fees and lock-in.

**Trade-offs.** Operating a routing container (~2–4 GB RAM for Kerala extract). OSM road data in Kochi is good; bus route data is weak → transit times are **labelled "estimated"** with ranges. Mixing Google autocomplete with non-Google map display must be reviewed against current Google ToS (open legal question L-3); if disallowed, switch autocomplete to Ola Maps/Mappls.

---

## ADR-011 Data architecture: first-party listings with field-level provenance — Accepted

**Context.** AI must never invent facts; no licensed PG/mess dataset exists for Kochi; scraping aggregators is not assumed legal.

**Decision.**
1. Every listing is a first-party record owned by Livo, created by admin data entry, partner submission, or (V1) business self-listing — never scraped.
2. Every material fact (price, deposit, food-included, AC, availability) carries a `FactProvenance`: `{sourceType: verified|partner|api|estimated|user|stale, sourceId, observedAt, verifiedBy, confidence}`.
3. Freshness is computed, not stored as a flag: a fact becomes `stale` when `now - observedAt > ttlForFactType` (e.g., price 45 days, availability 7 days, amenities 180 days).
4. UI always renders provenance chips; budget engine propagates the worst provenance of its inputs to the total ("Estimate — includes 2 unverified inputs").

**Trade-offs.** Manual operations cost (data team calling PGs). Accepted: this is the moat.

---

## ADR-012 Money, units and time — Accepted

- Money stored as **integer paise** (`BIGINT`), currency code column (default `INR`) for future multi-currency; no floats anywhere in budget math.
- Distances in metres (int), durations in seconds (int).
- Timestamps `timestamptz` UTC; display in `Asia/Kolkata`.
- "Month" in budget = calendar-day proration: `monthlyCost × days / 30` only for display of monthly equivalent; trip totals computed from actual date range (see Budget Engine).

---

## ADR-013 Hosting & regions — Proposed

**Decision.** Vercel (Next.js, function region `bom1` Mumbai) + managed Postgres with PostGIS in Mumbai (**Neon** or **Supabase** — choose by: PostGIS support ✔ both; branching for preview envs (Neon strong); PITR on chosen plan; price at 10 GB; connection pooling). Worker + routing containers on Railway/Fly/Render (nearest region). R2 for storage. Upstash Redis (Mumbai/Singapore).

**Trade-offs.** Multiple vendors to manage; mitigated by Terraform/`infra/` docs and a single `.env` schema validated by Zod at boot.

---

## ADR-014 Ranking without opaque scores — Accepted

**Decision.** "Recommended" = (1) apply user's hard constraints; (2) compute full monthly cost (rent + food + commute) and door-to-door time; (3) take the Pareto front of (cost, time); (4) order front by user's stated priority (cheapest vs closest), then the rest; (5) each card shows **reason chips** derived from rules ("₹2,100/mo cheaper than median", "18 min by bus", "food included"). No single 0–100 score shown. Sponsored items are never inserted into "Recommended" ordering (see Monetization).

---

## ADR-015 i18n — Accepted

`next-intl` with message catalogs; English only in MVP but all UI strings externalized from day one; DB content fields that are user-facing get optional `name_ml`, `name_hi` columns only in V2 (avoid premature translation tables). Number/currency formatting via `Intl` with `en-IN` (lakh grouping).
