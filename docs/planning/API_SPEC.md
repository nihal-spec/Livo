# Livo — API Specification

## Conventions

- Base path: `/api/v1`. JSON only. Route Handlers for anything called by client-side data fetching (TanStack Query), public/SEO, or future mobile apps. **Server Actions** only for form mutations inside the app (they call the same service functions). Every mutation path, action or route, uses the same Zod schema from `packages/schemas`.
- **Auth levels:** `public` (no session needed; guest cookie auto-created by middleware), `guest+` (guest or user session required), `owner` (viewer owns resource — user id or guest session id), `user` (signed-in), `perm:<x>` (admin permission, plus 2FA step-up).
- **Errors** (RFC 9457 problem+json):
  ```json
  { "type": "https://livo.app/errors/validation", "title": "Invalid request", "status": 422,
    "code": "VALIDATION_FAILED", "requestId": "req_…", "errors": [{ "path": "filters.maxPrice", "message": "…" }] }
  ```
  Codes: `VALIDATION_FAILED 422`, `UNAUTHENTICATED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `CONFLICT 409` (optimistic lock), `RATE_LIMITED 429` (+ `Retry-After`), `UPSTREAM_UNAVAILABLE 503`, `AI_DISABLED 503`, `INTERNAL 500`.
- **Pagination:** cursor-based (`?cursor=…&limit=20`, max 50) → `{ items, nextCursor }`. Admin tables may use offset pagination (`page`, `pageSize ≤ 100`) with total counts.
- **Money:** `amountPaise` as string (bigint-safe) + `currency`. **Durations:** seconds; ranges as `{min,max}`.
- **Provenance** object attached to every fact: `{ sourceType, label, observedAt, stale }`.
- **Rate limits** (Upstash sliding window; key = user id or guest session id, plus IP bucket): defaults below per route; `X-RateLimit-*` headers.
- **Idempotency:** `Idempotency-Key` header accepted on POST creating plans/reports.
- **CSRF:** Server Actions have built-in origin checks; route handlers with cookies require `Origin`/`Sec-Fetch-Site` same-origin check for non-GET.

## 1. Destinations & geo

| Method | Path | Auth | Rate | Notes |
|---|---|---|---|---|
| GET | `/destinations/autocomplete?q=&sessionToken=` | public | 60/min | Merges anchor alias matches (first) + geocoder predictions. Returns `{id?, anchorSlug?, providerPlaceId?, label, kind}` |
| POST | `/destinations/resolve` | public | 30/min | `{anchorSlug} | {providerPlaceId} | {lat,lng,label}` → `Destination` (creates CUSTOM destination row for pins; dedup within 50 m) |
| GET | `/destinations/:slug` | public | 120/min | Anchor details + entrances |
| GET | `/regions/:slug/areas` | public | 120/min | Areas with centroid; V1 polygons |

## 2. Search

### GET `/search/accommodation`

- **Auth:** public. **Rate:** 60/min per session, 300/min per IP.
- **Query (Zod):**
  ```
  destinationId      string (required)
  checkIn, checkOut  date (optional; default: today+7, +30)
  people             int 1–20 (default 1)
  kinds[]            AccommodationKind
  occupancy          SINGLE|SHARED|ANY
  genderPolicy       MEN|WOMEN|ANY|FAMILY
  priceMin, priceMax int rupees (basis-normalized to month if stay ≥ 28 days else night)
  ac                 true|false
  privateBath        true|false
  foodIncluded       true|false
  amenities[]        amenity keys
  commuteMode        WALK|BUS|METRO|AUTO|TWO_WHEELER|ANY
  maxCommuteMin      int 5–180
  radiusKm           float 0.5–30
  verifiedOnly       bool
  sort               recommended|price|total_cost|closest|value
  priority           cheapest|closest|balanced (for recommended)
  cursor, limit
  bbox               minLng,minLat,maxLng,maxLat (map-driven search)
  ```
- **200:**
  ```json
  {
    "destination": {"id":"…","name":"Infopark Phase 1"},
    "items": [{
      "placeId":"…","slug":"…","name":"…","kind":"PG","photo":{"url":"…","alt":"…"},
      "location":{"lat":10.0,"lng":76.3},
      "room":{"id":"…","occupancy":"DOUBLE","ac":false,"privateBath":false,
              "price":{"amountPaise":"650000","basis":"PER_MONTH"},"deposit":{"amountPaise":"1300000"},
              "provenance":{"sourceType":"VERIFIED","label":"Verified","observedAt":"…","stale":false}},
      "foodIncluded":true,
      "commute":{"mode":"BUS","durationS":{"min":1500,"max":2400},"distanceM":5200,
                 "fare":{"minPaise":"1500","maxPaise":"2500"},"method":"RULE","label":"Estimated"},
      "monthlyTotal":{"amountPaise":"…","confidence":"MEDIUM"},
      "reasons":[{"code":"FOOD_INCLUDED"},{"code":"CHEAPER_THAN_MEDIAN","value":"210000"}],
      "sponsored": false
    }],
    "facets": {"kinds":{"PG":42,"HOSTEL":9},"priceHistogram":[…],"counts":{"verified":38,"total":51}},
    "nextCursor": "…",
    "dataVersion": "2026-10-03T02:00Z"
  }
  ```
- **Errors:** 422 invalid filters; 404 unknown destination; 503 if DB degraded (serve stale cache if available with `"stale": true`).
- **Empty:** `items: []` + `nearMisses: {cheapestOverBudget, closestOutsideRadius, relaxations:[{filter, wouldAdd:n}]}` — powers helpful empty states.

### GET `/search/food` — same pattern: `near` (destinationId or placeId), `kinds[]`, `diet`, `meals[]`, `delivers`, `priceMax`, sort `price|closest`.
### GET `/search/services` — `category` ∈ {HOSPITAL, PHARMACY, DIAGNOSTICS, GROCERY, LAUNDRY, ATM, COWORKING, GYM}, `near`, `openNow`, `limit`.

## 3. Places

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/places/:idOrSlug` | public | Full detail: rooms, food plans, amenities, photos, provenance per fact, contact (phone revealed via separate call), nearby services summary |
| POST | `/places/:id/contact-reveal` | guest+ (10/hour) | Returns phone/WhatsApp; logs `OutboundClick` (anti-scraping of numbers) |
| GET | `/places/:id/travel?destinationId=&modes[]=` | public | Travel estimates per mode |
| POST | `/places/:id/reports` | guest+ (5/hour) | `{reason: WRONG_PRICE|CLOSED|WRONG_LOCATION|FAKE|OTHER, detail≤1000}` |

## 4. Transport

| GET | `/transport/estimate?origin=lat,lng|placeId&destinationId=&modes[]=&departBand=` | public 60/min | Our routing + fare rules; always labelled with method |

## 5. Plans

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| POST | `/plans` | guest+ (20/day guest) | `{title?, requirements: TripRequirements, destinationId, startDate, endDate, people, incomeInr?, budgetCapInr?, cashOnHandInr?}` | Plan |
| GET | `/plans` | user or guest | cursor | own plans |
| GET | `/plans/:id` | owner or `?share=token` (read-only) | | Plan + items + latest budget |
| PATCH | `/plans/:id` | owner | partial + `version` | Plan (409 on stale version) |
| DELETE | `/plans/:id` | owner | | 204 (soft) |
| POST | `/plans/:id/items` | owner | `{kind, placeId?, roomOptionId?, foodPlanId?, travelMode?, custom?}` | PlanItem |
| DELETE | `/plans/:id/items/:itemId` | owner | | 204 |
| POST | `/plans/:id/share` | owner | `{enabled:boolean}` | `{shareUrl|null}` (token rotated on re-enable) |
| POST | `/plans/:id/duplicate` | owner/share viewer | | new Plan owned by viewer |

## 6. Budget

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/budget/calculate` | public (60/min) | Stateless: `BudgetInput` → `BudgetResult`. Same engine is bundled client-side; server call used for SSR and as source of truth when saving |
| GET | `/plans/:id/budget?scenarioId=` | owner | Computes with current data; returns result + `changedSinceSnapshot` diff if prices moved |
| POST | `/plans/:id/budget/snapshots` | owner (user) | Saves BudgetSnapshot |

## 7. Scenarios

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/plans/:id/scenarios` | owner | `{name, overrides: ScenarioOverrides}` → scenario + BudgetResult + diff vs base + alternative items chosen |
| GET | `/plans/:id/scenarios` | owner | list |
| POST | `/plans/:id/scenarios/:sid/apply` | owner | Promote scenario into plan (confirmation in UI) |
| DELETE | `/plans/:id/scenarios/:sid` | owner | |

`ScenarioOverrides` (Zod): `{ budgetCapInr?, endDate?, durationDays?, occupancy?, foodIncluded?, commuteMode?, maxCommuteMin?, swapRoomOptionId?, lever?: 'CHEAPER'|'CLOSER'|'FOOD_INCLUDED'|'PUBLIC_TRANSPORT'|'PRIVATE_ROOM' }`.

## 8. AI

| Method | Path | Auth | Rate | Notes |
|---|---|---|---|---|
| POST | `/ai/extract` | public | guest 20/day, user 60/day, IP 100/day | `{text ≤ 1000, locale?}` → `{requirements: TripRequirements, destinationCandidates[], missing[]}`; 503 `AI_DISABLED` → client falls back to form |
| POST | `/ai/chat` | guest+ | same pool | `{conversationId?, planId?, message ≤ 1000}` → **stream** (SSE via AI SDK data stream): text deltas, `place` tokens, `proposal` events (scenario/plan patch), `done{usage}` |
| POST | `/ai/proposals/:id/confirm` | owner | 30/min | Applies a write proposal via normal service |
| DELETE | `/ai/conversations/:id` | owner | | Deletes content |

## 9. Saved items & account

| Method | Path | Auth |
|---|---|---|
| GET/PUT/DELETE | `/me/saved-places[/:placeId]` | user |
| GET/PUT | `/me/preferences` | user |
| GET | `/me/export` | user (async; emails link to JSON export, 3/day) |
| DELETE | `/me` | user + recent re-auth → 14-day deletion window |

## 10. Reviews (V2)

`GET /places/:id/reviews` (public, cursor), `POST /places/:id/reviews` (user, verified-stay signal required, 1 per place per 90 days), `POST /reviews/:id/flag`, business responses `POST /reviews/:id/response` (perm: business owner of place).

## 11. Admin (`/api/v1/admin/*`)

All require admin session + 2FA step-up; every mutation writes `AuditLog`; all list endpoints support `q`, filters, `sort`, `page`, `pageSize`.

| Method | Path | Permission |
|---|---|---|
| GET | `/admin/dashboard/metrics?range=` | `dashboard:view` |
| GET/POST | `/admin/places` | `places:read` / `places:create` |
| GET/PATCH | `/admin/places/:id` | `places:read` / `places:update` (requires `version`) |
| POST | `/admin/places/:id/verify` | `places:verify` — `{factKeys[], method, note}` |
| POST | `/admin/places/:id/publish` · `/unpublish` · `/reject` | `places:publish` |
| POST | `/admin/places/:id/photos/upload-url` | `places:update` → presigned PUT (5 min, size ≤ 8 MB, image/*) |
| POST | `/admin/places/merge` | `places:merge` — `{survivorId, duplicateIds[]}` |
| GET | `/admin/review-queue` | `places:read` |
| GET/PATCH | `/admin/reports[/:id]` | `reports:read` / `reports:resolve` |
| GET | `/admin/users` · `/admin/users/:id` | `users:read` (PII masked unless `users:pii`) |
| POST | `/admin/users/:id/suspend` · `/unsuspend` | `users:suspend` (reason required) |
| GET/POST/DELETE | `/admin/roles`, `/admin/users/:id/roles` | `roles:manage` (Super Admin only; re-auth) |
| GET/POST | `/admin/data-sources`, `/admin/data-sources/:id/sync` | `data:read` / `data:sync` |
| GET | `/admin/jobs?state=failed` · POST `/admin/jobs/:id/retry` | `jobs:read` / `jobs:retry` |
| GET/PUT | `/admin/cost-assumptions`, `/admin/fare-rules` (new version rows only) | `data:assumptions` |
| GET | `/admin/ai/usage?range=&groupBy=model|task` · `/admin/ai/conversations/:id` (content only with `ai:content`) | `ai:read` |
| GET/PUT | `/admin/feature-flags/:key` | `flags:manage` |
| GET | `/admin/audit-log` | `audit:read` |
| GET | `/admin/health` | `system:read` |

## 12. Internal

- `POST /api/internal/revalidate` — worker → app; HMAC-SHA256 signature header + timestamp (5-min window), IP not trusted.
- `GET /api/health` — public minimal (`ok`), detailed only with internal token.
- Vercel Cron endpoints `/api/cron/*` — verify `CRON_SECRET` bearer.
