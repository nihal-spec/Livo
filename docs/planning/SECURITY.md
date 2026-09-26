# Livo — Security, Privacy & Compliance

## 1. Assets & threat model (summary)

| Asset | Threats | Primary controls |
|---|---|---|
| Listing data (our moat) | scraping, competitor bulk export, poisoning via fake reports/claims | rate limits, contact-reveal gating, no bulk public API, moderation, provenance, four-eyes publish |
| Owner phone numbers | harvesting/spam | reveal endpoint with limits + logging, no numbers in HTML/SEO pages |
| User PII (email, income, plan dates, hospital-visit context) | breach, over-collection, internal misuse | minimisation, encryption, RBAC + masking, audit, retention |
| Admin accounts | phishing, brute force, privilege escalation | OAuth/magic link (no passwords) + TOTP, step-up, role-change alerts |
| AI features | prompt injection, tool abuse, cost exhaustion, data exfiltration | tool registry authz, no network tools, grounding guard, per-session caps, spend circuit breaker |
| External API keys | leakage, quota theft | server-only env, key restrictions (HTTP referrer/IP/API restrictions), per-key budgets/alerts |
| Infrastructure | dependency compromise, misconfig | lockfiles, Dependabot/Renovate, SCA, secret scanning, least-privilege DB roles |

Note on sensitive context: a plan linked to a hospital reveals that the user or family member is receiving care. Treat hospital-attendant plans as **sensitive**: no hospital name in analytics events (use category only), no email subject lines naming hospitals, shorter default retention.

## 2. Controls checklist

**Authentication**
- Auth.js v5, Google OAuth + email magic link (15-min single-use tokens, hashed at rest). No passwords in MVP.
- DB sessions, 30-day rolling; revoke on suspend/delete; list & revoke sessions in profile (V1).
- Admin: TOTP (RFC 6238) mandatory, encrypted secret, recovery codes (hashed), step-up windows (see Admin spec).
- Brute force: magic-link requests 5/hour/email + 20/hour/IP; TOTP 5 attempts then 15-min lock + alert.

**Authorization**
- Central `can()`/`requirePermission()` in service layer; ownership checks (`ownerUserId` or `guestSessionId`) in repositories via mandatory `viewer` parameter.
- Tests: permission matrix test enumerates every admin route × role.
- Share tokens: 128-bit random, read-only, revocable, not indexed (noindex + no links).

**Input/output**
- Zod on every boundary (route handlers, server actions, tool calls, job payloads, env).
- SQL injection: Prisma parameterization; TypedSQL/`$queryRaw` tagged templates only — `$queryRawUnsafe` banned by lint rule.
- XSS: React escaping; no `dangerouslySetInnerHTML` except sanitized (DOMPurify) admin-authored markdown; strict CSP with nonces; `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (geolocation only on search pages when user taps "use my location").
- CSRF: SameSite=Lax cookies; Server Actions origin check; route handlers verify `Origin` for state-changing methods.
- Cookies: `__Host-` prefix where possible, `Secure`, `HttpOnly`, `SameSite=Lax`.

**Rate limiting & abuse**
- Upstash sliding windows per route (see API spec), per session + per IP (hashed); bot detection on autocomplete/search (Vercel BotID or Cloudflare Turnstile on suspicious traffic only).
- Search result caps (max 50/page; 500 candidates); no "export" of listings publicly.

**File uploads**
- Presigned PUT to private R2 prefix; content-length and content-type conditions in signature; ≤ 8 MB; worker verifies magic bytes, decodes with sharp (reject on failure), re-encodes, strips metadata; only derived images public; random object keys; no SVG uploads.

**SSRF**
- No feature fetches user-supplied URLs. Outbound HTTP only via allowlisted provider clients (hosts in config). Webhook/revalidate endpoints are inbound only.

**Webhooks / internal endpoints**
- HMAC-SHA256 with timestamp + replay window; constant-time compare; per-sender secrets; Cron secret for Vercel Cron.

**Secrets**
- Vercel/host environment secrets; never in repo; `.env.example` only; Zod-validated at boot; rotate on staff change; separate keys per environment; Google Maps keys restricted by API + referrer (browser key) / server key never exposed.

**Data protection**
- TLS everywhere; DB encryption at rest (provider); field-level envelope encryption (app key from KMS/secret) for TOTP secrets and any future ID documents (business verification V1 — prefer not storing documents at all; store verification outcome only).
- Logging redaction (Architecture §13); no request bodies logged for AI/auth routes; Sentry PII scrubbing.
- DB roles: `app_rw` (no DDL, no UPDATE/DELETE on audit_log), `migrator`, `readonly_analytics` (views excluding PII).
- Backups with PITR; restore drill before launch.

**AI**
- See AI_ARCHITECTURE §5–7: tool allowlist, authz per call, Zod args, clamps, per-turn/per-conversation budgets, untrusted-content fencing, grounding output guard, no network/file tools, spend circuit breaker, red-team tests in CI.

**Dependencies & supply chain**
- pnpm lockfile, `pnpm audit` + GitHub Dependabot, CodeQL, secret scanning + push protection, pinned GitHub Actions by SHA, minimal third-party scripts (PostHog, Sentry only).

**Monitoring security events**
- Admin login failures, 2FA failures, role changes, PII reveals, mass contact reveals, rate-limit bans, AI abuse flags → security events view + alerts.

## 3. Privacy by design (DPDP-oriented)

- **Minimise:** income and cash-on-hand optional and plan-scoped; no government IDs; no precise user location stored (only destination & chosen places); analytics without names/emails/hospital names.
- **Notice & consent:** clear privacy notice at sign-up and before storing plan data for signed-in users; separate opt-in for marketing email and for (future) preference learning.
- **Rights:** export (JSON) and deletion self-serve; correction via profile; grievance contact published.
- **Retention:** per DATABASE_DESIGN §7.
- **Breach response:** runbook with notification steps to the Data Protection Board and affected users as required by the DPDP Rules; tabletop before launch.
- **Children:** service not directed at children; students under 18 (e.g., coaching) would trigger verifiable parental consent requirements → **MVP ToS: 18+ only**; revisit with counsel.

## 4. Legal / compliance areas needing professional review

| ID | Area | Question for counsel |
|---|---|---|
| L-1 | **DPDP Act 2023 + DPDP Rules 2025** | Rules notified 13 Nov 2025 with phased timeline: consent-manager framework from 13 Nov 2026; substantive obligations (notice, consent, security safeguards, breach reporting, data principal rights) by 13 May 2027. Confirm our notice/consent flows, retention, breach process, and whether we could be a Significant Data Fiduciary (unlikely at MVP). |
| L-2 | GDPR-style principles | Only relevant if we target EU users (not planned); adopt principles anyway. |
| L-3 | **Google Maps Platform terms** | Can we use Places Autocomplete/Geocoding for user input while displaying results on a MapLibre/OSM base map? What may we store (place_id; lat/lng duration)? If not permitted → switch to Ola Maps/Mappls/Nominatim. |
| L-4 | OSM ODbL | Attribution; whether our listing DB combined with OSM POIs becomes a derivative database requiring share-alike (keep OSM-derived POIs in separate tables/"collective database" pattern). |
| L-5 | KMRL GTFS / fare data licence | Confirm redistribution rights. |
| L-6 | Listing data & photos | Owner consent to publish info and phone numbers; photo licences; takedown process. |
| L-7 | UGC & reviews (V1/V2) | Intermediary obligations under IT Rules 2021 (grievance officer, takedown timelines); defamation risk from reviews; Consumer Protection (E-Commerce) Rules and fake review guidance (BIS IS 19000:2022 standard on online consumer reviews). |
| L-8 | Affiliate & sponsored disclosure | ASCI guidelines for influencer/advertising disclosure; label placement. |
| L-9 | Medical/logistics disclaimer | Wording ensuring no medical advice; hospital names/marks usage. |
| L-10 | Terms of Service | Liability for inaccurate prices/availability; we're an information service, not a broker (avoid acting as a real-estate agent under Kerala RERA rules without registration — confirm). |
| L-11 | Payments/bookings (future) | RBI payment aggregator rules if we ever collect money; GST on commissions. |
| L-12 | Data deletion/export & backups | Acceptable backup-expiry deletion approach. |

## 5. Security launch gate (must pass)
- [ ] Permission matrix tests green; admin 2FA enforced.
- [ ] CSP in enforce mode; security headers verified.
- [ ] Rate limits active on all public routes; contact-reveal limits tested.
- [ ] Secrets scanned; keys restricted; spend alerts configured for maps & AI.
- [ ] Backup restore drill done.
- [ ] AI red-team suite passing; spend circuit breaker tested.
- [ ] Privacy notice, ToS, disclaimers reviewed by counsel.
- [ ] Incident & breach runbooks written; on-call contact list.
