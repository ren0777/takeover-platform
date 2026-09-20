# TakeOver.com Shared Memory

## Current Phase

**V1 software complete locally as of 2026-09-20; external launch gates open.** Phases 0–5 and 8 are IMPLEMENTED NOW with local acceptance evidence. Phase 6 (battles) and referrals are outside approved V1 scope. Phase 9 launch tooling exists, but payment-sandbox, email-delivery, hosting and operational acceptance have not been performed. See [PHASES.md](PHASES.md), [LAUNCH.md](LAUNCH.md) and [MEMORY-TREE.md](MEMORY-TREE.md).

## Verified evidence (2026-09-20, branch `feat/v1-completion`)

Run on Windows 11 with Node 24, pnpm 10.32.1 invoked directly, and a disposable PostgreSQL 17 container (`takeover_v1_test`, loopback only, tmpfs). All eight migrations applied from a clean reset.

- `pnpm typecheck`: shared, database, web, api all pass.
- `pnpm lint`: all packages pass.
- `pnpm test` (no database): shared 105, web 228, database 16, api 273 — 622 passed.
- `pnpm test:integration` (dedicated PostgreSQL): database 58, api 98 — 156 passed across 14 files, including takeover/refund/reconciliation (39), webhook ordering (5), competition (4) and operator (4).
- `pnpm build`: shared, database, api (`tsc`) and web (`next build`, 17 routes) succeed.
- `pnpm smoke:api`: compiled production runtime starts, reports `/health` and database-backed `/ready`, serves the 404 envelope and shuts down cleanly.

Defects found and fixed during this pass: a non-terminal `payment.processing` webhook arriving after a refund returned no status instead of the terminal `REFUNDED` status; `LOG_LEVEL` was parsed but never applied to the Fastify logger (both have regression tests); `packages/database/test/phase3.test.ts` never removed its rows, which broke API tests asserting global checkout counts when the suites ran in CI order; and `verify.yml` exported `TAKEOVER_LIVE_RESOURCES=all` job-wide, which would have pointed the web fixture tests at the network (now scoped to the build step).

## What Works

- pnpm monorepo with independently buildable `apps/web` and `apps/api`; `pnpm test` needs no database and `test:integration` refuses any database whose name lacks `test` or without `TAKEOVER_ALLOW_TEST_DATABASE_RESET=true`.
- Fastify health/readiness (database-probing `/ready`), redacted structured logging, hardened response headers, body/connection/request limits, validated configuration and graceful shutdown.
- Company identity: drafts, verified contact email, purpose-bound opaque challenges, company-scoped HttpOnly sessions with CSRF and exact-Origin checks, access requests with manager decisions, manual-recovery request creation, durable rate limits and audit records.
- Territories: categories, authoritative `displayWeight`, deterministic reviewed seed, public list/detail/history/company projections, single active reign enforced by `btree_gist`, transaction-bound ownership primitive.
- Takeover payments: legal-minimum quotes, provider-neutral checkout and payment records, `DodoPaymentProvider`, signature-verified Standard Webhooks ingestion with per-event idempotency, CAS ownership capture, refund obligations for lost races or money mismatches, reconciliation sweep driver, browser status tokens. Non-terminal or unknown provider events are recorded and ignored; only explicit terminal events change payment truth.
- Competition: authoritative company statistics and score (100 per active territory + 25 per distinct category, stable company-ID ties), leaderboard, committed durable capture activity with resumable SSE, configurable 30-day seasons with serializable retry-safe rollover, frozen results and Hall of Fame. Capture and season finalization serialize on a PostgreSQL advisory lock.
- Operator tools: independent bearer credential (never a company cookie), `read`/`moderate` permission matrix, bounded inspection/list APIs, transactional company/territory/grant moderation and audited recovery decisions with a mandatory reason and stale-mutation rejection.
- Email: development capture transport, deliberate `unavailable` transport, and a Resend transport behind the existing provider interface with request timeout and safe failure. Production requires HTTPS `WEB_APP_ORIGIN`, `RESEND_API_KEY` and `EMAIL_FROM`.
- Web: public territory, company, leaderboard, seasons, hall-of-fame and activity pages, share links, sharing metadata, `robots.txt`, `/api` proxy to the API origin.
- Launch tooling: `compose.yaml` (PostgreSQL, migration job, API, loopback web), `compose.test.yaml`, `Dockerfile`, GitHub Actions `verify.yml` running the full pipeline against a PostgreSQL service, and runbooks in `LAUNCH.md`, `OPERATIONS.md` and `EMAIL.md`.

## Not Performed (external launch gates)

- Real email delivery from a verified Resend sender.
- Dodo sandbox end-to-end matrix (capture, failure, duplicate, mismatch, concurrent bidders, refunds, late webhooks). `DODO_LIVE_ENABLED` must stay `false` until it is signed off.
- Hosting, TLS/reverse proxy, secret provisioning, backup/restore drill, alert delivery, load evidence, and policy/operational sign-off.

None of the above is claimed by unit or integration tests.

## Broken / Known Issues

- `@prisma/adapter-pg` 7.10.0 emits a `pg` deprecation warning during the deliberate concurrent approve/reject test. Assertions and database invariants pass. Track upstream before adopting `pg` 9; do not suppress the warning.
- Fastify cold start under heavy concurrent tooling on Windows was measured at 7.5–13 s for the first HTTP injection; integration test and hook timeouts are 30 s. The compiled smoke keeps its own 5 s shutdown deadline so runtime regressions are not masked.
- The Windows global Corepack wrapper launched an incompatible nested pnpm; invoke the pinned pnpm 10.32.1 directly.

## Important Architectural Decisions

- V1 has no `User`, password, signup/login, password reset, global session, or generic authenticated dashboard.
- Company identity, email verification, management authority, payment confirmation, ownership and operator authority are separate. Company sessions never grant operator authority.
- Raw capability tokens are delivered only through the email-provider boundary, then exchanged for opaque, short-lived, server-resolved company-scoped sessions.
- Management cookies use `HttpOnly`, production `Secure`, `SameSite=Lax`, no `Domain`, and `Path=/api`; state-changing routes also require an exact trusted Origin and double-submit CSRF secret.
- Existing authoritative website collisions enter the access-request flow; they never silently merge, duplicate, or grant authority.
- PostgreSQL is the durable source of truth for every domain state, throttle, activity event and audit. Redis, queues and workers are absent; the reconciliation sweep runs inside the API process.
- `TerritoryOwnership` is the sole ownership source of truth; ownership and financial history are preserved and never rewritten by moderation or season rollover. Paid ownership survives season boundaries; season results are frozen snapshots.
- Unknown refund outcomes retain their claim until reconciled; a refund is completed only by a verified provider refund webhook, and completed refunds stay terminal over later out-of-order events.
- Dodo base URL must be an official host; live mode needs the live host **and** `DODO_LIVE_ENABLED=true`. Removing Dodo configuration disables checkout and provider reconciliation together.
- `displayWeight` is backend-authoritative on `1..100` with no gameplay meaning; `contested` and battles are absent.
- Production `/ready` must probe the database; unit tests never mark external gates complete.

## API Contracts

Unpaginated success responses use `{ data }`; paginated success responses use `{ data, meta }` with required `meta.requestId`. Errors use the stable `ApiError` envelope. All public contracts live in `@takeover/shared` (`competition.ts` and `operator.ts` were added for V1 completion).

- `GET /health`, `GET /ready` — readiness probes the database when `DATABASE_URL` is configured
- Identity: `POST /api/company-claims`, `POST /api/email-verifications`, `POST /api/email-verifications/exchange`, `POST /api/company-management-links`, `POST /api/company-management-links/exchange`, `GET /api/company-management/context`, `GET /api/company-management/access-requests`, `DELETE /api/company-management/session`, `POST /api/company-access-requests/:id/approve|reject`, `POST /api/company-recovery-requests`, `PUT /api/takeover-intents/:id/preparation`
- Territories: `GET /api/territory-categories`, `GET /api/territories`, `GET /api/territories/:slug`, `GET /api/territories/:slug/history`, `GET /api/companies/:slug`, `GET /api/companies/:slug/territories`
- Takeover: `POST /api/takeover-quotes`, `POST /api/takeover-checkouts`, `GET /api/takeover-status/:statusToken`, `POST /api/payment/webhooks/dodo`
- Competition: `GET /api/leaderboard`, `GET /api/companies/:companyId/statistics`, `GET /api/seasons`, `GET /api/hall-of-fame`, `GET /api/activity`, `GET /api/activity/stream` (SSE, resumable via `Last-Event-ID`)
- Operator (bearer credential, registered only when `OPERATOR_ID`/`OPERATOR_CREDENTIAL` are configured): `GET /api/operator/{companies,territories,management-grants,audit-logs,payments,reconciliation-actions,recovery-requests}`, `GET /api/operator/{companies,territories,management-grants}/:id`, `POST /api/operator/companies/:id/{suspend,restore}`, `POST /api/operator/territories/:id/{disable,enable}`, `POST /api/operator/management-grants/:id/revoke`, `POST /api/operator/recovery-requests/:id/decision`
- `GET /__dev/email-captures/:messageId` — development only, explicit opt-in, loopback only

Cookie-authenticated mutations require `takeover_management`, `takeover_management_csrf`, `X-CSRF-Token`, and the configured exact Origin. Company authority is resolved server-side.

## Database Changes

`packages/database` is the only Prisma owner. Applied migrations:

- `20260829000000_initialize_foundation`
- `20260829200842_add_company_claim_identity`
- `20260830000000_add_territory_ownership`
- `20260902000000_add_phase3_models`
- `20260903000000_reconcile_phase3_models`
- `20260905000000_add_reconciliation_sweep_index`
- `20260920100000_competition`
- `20260920110000_operator_recovery_resolution`

Models: `SystemMetadata`, `Company`, `CompanyContact`, `CompanyVerification`, `EmailVerificationChallenge`, `CompanyManagementGrant`, `CompanyManagementSession`, `CompanyAccessRequest`, `TakeoverIntent`, `TerritoryCategory`, `Territory`, `TerritoryOwnership`, `AuditLog`, `SecurityRateLimitBucket`, `TakeoverQuote`, `CheckoutSession`, `CheckoutStatusToken`, `Payment`, `PaymentWebhookEvent`, `OwnershipCapture`, `PaymentReconciliationAction`, `CompetitionSeason`, `CaptureActivity`. There is still no `User`, battle, referral, Redis, or worker model.

## Current Blockers

- No blocker for local V1 completion.
- Production launch is blocked on the external gates listed above; none may be marked complete from this repository alone.

## Agent Handoffs

### Interim Codex → Claude — manager access-request discovery

- New shared exports: `companyAccessReviewListQuerySchema`, `CompanyAccessReviewListQuery`, `companyAccessReviewItemSchema`, `CompanyAccessReviewItem`, `companyAccessReviewPageSchema`, and `CompanyAccessReviewPage`.
- `GET /api/company-management/access-requests` accepts optional opaque `cursor` and `limit` (default `50`, maximum `100`), and returns `{ items, nextCursor }` in the standard success envelope.
- The endpoint resolves the company only from the opaque management-session cookie. It needs no CSRF cookie/header because it is read-only, but rejects missing, expired, revoked, or cross-company session authority.
- Each item contains only `id`, `companyId`, `requesterEmail`, `status: 'pending'`, `requestedAt`, `expiresAt`, and optional `intent: { id, territoryExternalRef }`; it excludes contact IDs, grants, sessions, verification evidence, and quote amounts.

### Codex → Claude

Authoritative `@takeover/shared` exports safe to consume now:

- Constants: `COMPANY_STATUSES`, `VERIFICATION_LEVELS`, `ACCESS_REQUEST_STATUSES`, `TAKEOVER_INTENT_STATUSES`, `QUOTE_AUTHORITY`.
- Company: `httpsUrlSchema`, `companyStatusSchema`, `CompanyStatus`, `verificationLevelSchema`, `VerificationLevel`, `companyInputSchema`, `CompanyInput`, `companySchema`, `Company`, `companyContactSchema`, `CompanyContact`, `companyVerificationSchema`, `CompanyVerification`.
- Claim/intent: `companyClaimRequestSchema`, `CompanyClaimRequest`, `companyClaimResultSchema`, `CompanyClaimResult`, `territoryExternalRefSchema`, `quoteSnapshotSchema`, `QuoteSnapshot`, `takeoverPreparationRequestSchema`, `TakeoverPreparationRequest`, `takeoverIntentStatusSchema`, `TakeoverIntentStatus`, `takeoverIntentSchema`, `TakeoverIntent`.
- Verification/session: `emailVerificationRequestSchema`, `EmailVerificationRequest`, `emailTokenExchangeRequestSchema`, `EmailTokenExchangeRequest`, `emailTokenExchangeResultSchema`, `EmailTokenExchangeResult`, `managementLinkRequestSchema`, `ManagementLinkRequest`, `managementContextSchema`, `ManagementContext`, `acceptedDeliverySchema`, `AcceptedDelivery`.
- Access/recovery: `accessRequestStatusSchema`, `AccessRequestStatus`, `companyAccessRequestSchema`, `CompanyAccessRequest`, `accessDecisionRequestSchema`, `AccessDecisionRequest`, `accessDecisionResultSchema`, `AccessDecisionResult`, `recoveryRequestSchema`, `RecoveryRequest`, `recoveryRequestResultSchema`, `RecoveryRequestResult`.
- Existing envelopes/money/errors remain canonical: `ApiSuccess`, `ApiError`, schemas, `ERROR_CODES`, `ErrorCode`, `Money`, `moneySchema`, `createMoney`, `isMoney`, and currency constants.

Ready endpoints and security requirements are listed in **API Contracts** above. The dev email transport is not production-capable; manual recovery execution and checkout are unavailable. Quote snapshots are explanatory only and `quoteAuthority` is always `reference_only`.

### Claude → Codex

- Preserve frontend-only work in `apps/web`.
- Phase 2 design approves authoritative territory `displayWeight: number` on `1..100`; CSS mosaic position/adjacency has no gameplay meaning.
- A future SSE boundary is needed for real activity; do not synthesize production events.
- Phase 3 stale-price responses must include current owner, current winning amount, current legal minimum, currency, and version, and must require explicit review without auto-charge.

**Frontend is prepared for live territory reads — these assumptions need confirming (2026-08-31).**

`apps/web` can switch each public read resource from fixtures to the live API independently via `TAKEOVER_LIVE_RESOURCES` (comma-separated resource names, or `all`). No component change is needed to go live. The client halves exist but never run in production today, because every resource defaults to `fixture`.

The frontend had to guess the following. Each is centralised so a correction is a one-line change per resource. **Please confirm or correct these when the endpoints land, rather than letting the frontend discover them at runtime.**

1. **Paths** (assumed, in `TERRITORY_API_PATHS`): `/api/territory-categories`, `/api/territories`, `/api/territories/{slug}`, `/api/territories/{slug}/history`, `/api/companies/{slug}`, `/api/companies/{slug}/territories`.
2. **Unpaginated reads assume `{ data: T }`.** Categories, territory detail, public company, and company territories have published item contracts but no published response wrapper.
3. **Paginated reads use an envelope parser.** `territoryPageSchema` and `territoryHistoryPageSchema` extend the envelope and make `meta` **required**, unlike every other response. The generic client returns `data` alone, so these two use `apiRequestEnvelope`; a missing `meta` is a parse failure rather than a silently dropped cursor.
4. **Territory detail is assumed to include `ownershipHistoryPreview`.**
5. **A 404 on detail or company is treated as "not found"** and mapped to `null`; any other status propagates as an error.

Frontend invariants that must not be broken by the API:

6. **Territory `version` and `territoryVersion` stay opaque decimal strings** and are never parsed into a JS number. Tested against values beyond `Number.MAX_SAFE_INTEGER`.
7. **Production never silently serves fixture territory or ownership data.** A resource with no live source throws in production; an unreachable live resource propagates its error rather than falling back to fixtures.
8. **`getTerritories` currently discards page `meta`** because the board does not paginate yet. This is deliberate and stays until pagination is an explicit product requirement — changing it would touch the board component.

**Phase 2 territory frontend is implemented against the authoritative contracts (2026-08-31).** `apps/web` defines no territory types of its own. Public routes: `/territories` (Value Mosaic + category filter), `/territory/[slug]` (detail, five-entry history preview, full history), `/company/[slug]` (public profile + territory grid). All are server components shipping 164 B of client JavaScript.

Fixtures remain in `src/lib/fixtures/territories.ts` behind the per-resource seam because no public territory API exists yet. They are parsed through the real `.strict()` schemas at module load, so contract drift fails loudly. Flip `resolveSource` per resource when the endpoints land.

Three notes for Codex:

1. **`pnpm format:check` currently fails on 28 files**, all under `apps/api`, `packages/database`, `packages/shared`, `docs`, and `.superpowers`. `apps/web` is clean. Left untouched as Codex-owned; a single `pnpm format` would clear it.
2. **No territory read API yet.** When shipping `GET /api/territories`, note that `territoryPageSchema` and `territoryHistoryPageSchema` make `meta` **required** by extending the envelope, unlike every other response where `meta` is optional. The frontend parses those two with their own schemas for that reason.
3. **The five-entry history preview length is a server constant.** The frontend shows a "full history" link only when the preview is full, so if that constant changes the trigger should change with it.

**Phase 1 frontend is implemented and consumes the real contracts.** `apps/web` defines no company-identity types of its own; every request and response shape is imported from `@takeover/shared`. Routes: `/claim`, `/verify`, `/manage`, `/manage/company`, `/manage/recovery`, `/access-review`, all `noindex`.

Three issues found while integrating. None block Phase 2.

**1. BLOCKING for manager decisions — the review link cannot identify its access request.**
`sendAccessRequestNotification` links to `${origin}/access-review#token=…` and `AccessRequestEmail` carries no `accessRequestId`. After exchange, `ManagementContext` returns only company, verification levels, session expiry, and CSRF token. There is no endpoint listing pending requests for the session's company. So the frontend cannot obtain the `:id` that `POST /api/company-access-requests/:id/approve` requires, and a manager cannot actually approve or reject from the emailed link.

The page is built and renders the decision UI when an id is supplied as `?requestId=`, so either fix works with no frontend rework: include the id in the review link, or add a session-scoped endpoint returning pending access requests. The second is preferable — it survives an expired link and lets a manager review from an existing session.

**2. Resolved: `POST /api/company-management-links` no longer requires an undiscoverable `companyId`.**
Current contract: `contactEmail` plus exactly one HTTPS `companyWebsiteUrl` or normalized `companySlug`; valid-shaped nonmatches remain generic accepted responses. The following paragraph records the original integration finding.
`managementLinkRequestSchema` needs a UUID plus contact email. A returning manager has an email but no reason to know their company's UUID. The form currently asks for it and tells the user where to find it, which is poor. An enumeration-resistant lookup keyed on contact email — or on email plus normalized website — would remove the dead end. The response should stay identical whether or not a match exists.

**3. The web app must proxy `/api` — please keep this in mind for deployment.**
The API registers no CORS plugin and sets cookies with `Path=/api`, `SameSite=Lax`, no `Domain`. A cross-origin browser call from the web app would fail on both counts. `apps/web/next.config.ts` therefore rewrites `/api/*` to `TAKEOVER_API_ORIGIN` (default `http://127.0.0.1:4000`) so the browser stays same-origin and sends `Origin: WEB_APP_ORIGIN`, which the mutation check requires. If the API is ever exposed on its own public origin, it needs CORS with credentials and a cookie-domain strategy.

### Codex to Claude - enumeration-resistant management-link discovery

- `POST /api/company-management-links` accepts `{ contactEmail, companyWebsiteUrl }` or `{ contactEmail, companySlug }`; neither/both locators, non-HTTPS websites, invalid slugs, malformed emails, and legacy `companyId` input are rejected by the shared contract.
- Valid-shaped requests always return `202 { data: { accepted: true }, meta: { requestId } }`. They do not disclose locator existence, contact membership, verification, grant status, or company lifecycle eligibility.
- The server normalizes the website or slug, rate-limits normalized email, IP, and keyed locator scopes, then issues a token only for an eligible, company-scoped active grant with a verified, non-revoked contact. Unexpired drafts, active companies, and suspended companies remain eligible; archived companies and expired drafts do not.
- Shared, service, Fastify, and PostgreSQL integration tests are verified locally against the guarded dedicated test database.

**Runtime smoke verified on 2026-08-31.** After `pnpm db:test:prepare` accepted the dedicated loopback PostgreSQL `takeover_test` URL (database name contains `test` and reset required `TAKEOVER_ALLOW_TEST_DATABASE_RESET=true`), `company-identity-runtime-smoke.test.ts` started Fastify on `127.0.0.1` with an ephemeral port and exercised real `fetch` requests. Its one scenario covered a new-company claim, in-memory development-email fragment capture and exchange, scoped management cookies/CSRF/context, locator-based management-link issuance and single-use exchange, generic unmatched discovery, two existing-company access requests, session-scoped listing, and approved/rejected decisions after rejected Origin/CSRF attempts. Raw capability values stayed in test-local memory only and captures were cleared between exchanges. The result remains limited to development/test transport and dedicated PostgreSQL: no production email delivery, ownership, payment, or checkout was tested or made available.

**Minor:** `docs/superpowers/plans/2026-08-30-phase-2-territory-ownership.md` fails `pnpm format:check`. Left untouched as Codex-owned.

### Codex → Claude — Phase 2 contracts ready; APIs remain planned

### Codex → Claude — additive public company-not-found contract

- `@takeover/shared` now additionally exports `ERROR_CODES.COMPANY_NOT_FOUND` with stable value `COMPANY_NOT_FOUND`; this is additive and does not alter `NOT_FOUND` or existing error contracts.
- Territory query service misses use `TERRITORY_NOT_FOUND`; public-company query misses use `COMPANY_NOT_FOUND` with the safe message `Company was not found`.
- The public territory HTTP routes are still not registered in this task; when they are added, preserve these exact codes in the standard error envelope.

- Authoritative constants safe to consume: `TERRITORY_PUBLIC_STATUSES`, `TERRITORY_AVAILABILITY_STATUSES`, and `OWNERSHIP_SOURCES`.
- Authoritative schemas safe to consume: `territoryCategorySchema`, `territoryVisualMetadataSchema`, `companyPublicSummarySchema`, `territoryOwnershipSummarySchema`, `territoryHistoryEntrySchema`, `territorySummarySchema`, `territoryDetailSchema`, `companyTerritoriesSchema`, `territoryVersionSchema`, `displayWeightSchema`, `territoryStatusSchema`, `territoryAvailabilityStatusSchema`, `ownershipSourceSchema`, `paginationQuerySchema`, `pageMetaSchema`, `territoryListQuerySchema`, `territoryPageSchema`, and `territoryHistoryPageSchema`.
- Authoritative inferred types safe to consume: `TerritoryCategory`, `TerritoryVisualMetadata`, `CompanyPublicSummary`, `TerritoryOwnershipSummary`, `TerritoryHistoryEntry`, `TerritorySummary`, `TerritoryDetail`, `CompanyTerritories`, `PaginationQuery`, `PageMeta`, `TerritoryListQuery`, `TerritoryPage`, and `TerritoryHistoryPage`.
- Stable error codes now include `TERRITORY_NOT_FOUND`, `TERRITORY_CATEGORY_NOT_FOUND`, `INVALID_CURSOR`, `STALE_TERRITORY_VERSION`, `TERRITORY_DISABLED`, `OWNERSHIP_CONFLICT`, and `OWNERSHIP_HISTORY_INVALID`.
- `displayWeight` is an authoritative integer contract constrained to `1..100`; the frontend may map it to presentation tiers, but mosaic position and physical adjacency have no gameplay meaning.

## Phase 3 – Pricing, Checkout, Capture, Payment

The Phase 3 design specification is available at `docs/PHASE3_DESIGN.md`. No implementation changes have been made yet; this entry documents the hand‑off.

- `version` and `territoryVersion` are positive decimal strings over JSON. `CompanyPublicSummary` is a privacy-safe projection and does not replace the existing Phase 1 `Company` aggregate.
- These are contracts only. Public territory APIs and database-backed ownership are not implemented yet; fixtures must remain development-only. No contested, pricing, bid, payment, checkout, ownership mutation route, leaderboard, or live-event contract is available.

### Codex -> OmniRoute - Phase 2 public read API layer (2026-09-02)

- Public read routes are registered in `apps/api`: `GET /api/territory-categories`, `GET /api/territories`, `GET /api/territories/:slug`, `GET /api/territories/:slug/history`, `GET /api/companies/:slug`, and `GET /api/companies/:slug/territories`. They parse shared query schemas, runtime-validate slug params, use standard success/error envelopes, and expose no mutation route.
- `pageMetaSchema` now accepts the required paginated response metadata `{ requestId, limit, nextCursor? }`; route responses parse through `territoryPageSchema` and `territoryHistoryPageSchema`.
- API service/repository contract needed by any DB implementation: `listCategories()`, `findCategoryBySlug(slug)`, `listTerritories({ category?, status?, page })`, `findTerritoryBySlug(slug, historyLimit)`, `listTerritoryHistory(territoryId, page)`, `findPublicCompanyBySlug(slug)`, `listCompanyTerritories(companyId, page)`, and `countCompanyTerritories(companyId)`. Current API code includes a Prisma adapter for these methods, but this slice did not modify `packages/database`; OmniRoute can change DB internals as long as this interface and public projections stay intact.
- Unknown territory uses `TERRITORY_NOT_FOUND`; unknown category filter uses `TERRITORY_CATEGORY_NOT_FOUND`; malformed opaque cursors use `INVALID_CURSOR`; unknown company uses `COMPANY_NOT_FOUND`. Versions leave JSON as decimal strings beyond `Number.MAX_SAFE_INTEGER`; ownership history preview remains capped at five entries; suspended owners remain publicly named.
- Verification on 2026-09-02: focused API tests, shared territory contract tests, `apps/api` typecheck, `apps/api` lint, `apps/api` build, and `git diff --check` passed locally via a temporary Corepack `pnpm` shim because the global pnpm shim is unavailable on PATH.

### Codex -> Claude - Phase 2 public live reads complete (2026-09-02)

- Final source of truth: all six public read routes are registered and backed by the real Prisma/PostgreSQL repository: `GET /api/territory-categories`, `GET /api/territories`, `GET /api/territories/:slug`, `GET /api/territories/:slug/history`, `GET /api/companies/:slug`, and `GET /api/companies/:slug/territories`.
- Repository implementation status: `PrismaTerritoryRepository` implements `listCategories`, `findCategoryBySlug`, `listTerritories`, `findTerritoryBySlug`, `listTerritoryHistory`, `findPublicCompanyBySlug`, `listCompanyTerritories`, and `countCompanyTerritories`. The API uses these methods for live reads.
- Pagination behavior: territory list and territory history use opaque base64url JSON cursors, deterministic ordering, shared-schema `limit` validation, and `INVALID_CURSOR` for malformed, wrong-resource, or invalid cursor payloads. Category filtering validates existence first and returns `TERRITORY_CATEGORY_NOT_FOUND` for unknown categories.
- Response envelope behavior: unpaginated public reads return `{ data }`; paginated reads return `{ data, meta }`. Paginated `meta` includes required `requestId`, required `limit`, and optional `nextCursor`, matching the current `@takeover/shared` `pageMetaSchema`.
- Projection behavior: public statuses are only `unclaimed`, `claimed`, and `disabled`; no `contested` is emitted. Territory `version` and ownership `territoryVersion` leave JSON as decimal strings, including values beyond `Number.MAX_SAFE_INTEGER`. Territory detail uses the current active ownership projection as authoritative, keeps suspended owners publicly named, and caps `ownershipHistoryPreview` at exactly five entries when history has at least five rows. Public company responses exclude contact email, sessions, grants, access requests, verification tokens, recovery data, and other management internals.
- Real PostgreSQL verification: the dedicated `takeover_test` database on PostgreSQL 17 had all migrations deployed with `prisma migrate deploy`; `pnpm --filter @takeover/api test:integration` passed 43 tests, including a six-route real-data test for categories, list pagination, category filter, claimed/unclaimed/disabled projection, detail, five-entry preview, history pagination/meta, company projection, company territories, not-found errors, invalid cursor, privacy leakage, and version-string preservation.
- Claude smoke result: started the compiled API on `http://127.0.0.1:4000` against the seeded PostgreSQL test database and ran `TAKEOVER_API_ORIGIN=http://127.0.0.1:4000 pnpm --dir apps/web territory:contract-smoke`; result was 6 passed, 0 failed, 0 skipped.
- Claude can flip the frontend live-read resources without route changes. No Phase 3 pricing, capture, payment, bid, activity, season, battle, worker, or Redis behavior was implemented.

### Claude -> Inception/Codex - Phase 3 frontend UX prepared, implementation blocked on contracts (2026-09-02)

- Design only, nothing implemented: `docs/superpowers/specs/2026-09-02-phase-3-frontend-takeover-ux-design.md` covers all 17 takeover states, the 14 error/edge cases, polling, accessibility, and mobile. No pricing, checkout, payment, capture, or Dodo code exists in `apps/web`. Section 13 reconciles this spec against Inception's `docs/PHASE3_DESIGN.md`; their naming wins where the two overlap.
- Minimum surfaces proposed: the existing `/territory/[slug]` gains one quote panel, plus exactly one new route keyed by the opaque checkout id, which is both the provider return target and the authoritative status surface. No separate checkout, refund, or reconciliation routes.
- **Primary ask: publish one discriminated `state` field on the payment-status response, plus which values are terminal.** `CheckoutSession.status` and `Payment.status` cannot express capture, reconciliation, refund, or losing the territory to another company, and `Payment.status = CAPTURED` reads as territory capture but means money taken. A frontend composing those two enums will eventually render ownership that does not exist.
- Four other blocking gaps are listed in section 13: the status endpoint is management-session gated, so a payer returning without a session cannot see the state of money already spent; price-changed and version-stale are indistinguishable at `409`; the charge model is undecided (`minimumAmountMinor` versus `intendedAmountMinor`), which is the difference between a one-button panel and an amount form; and `returnUrl` is client-supplied, which is an open-redirect surface.
- Encoded hard rules: browser return URLs are ignored entirely, no state says captured without committed server state, no amount is derived client-side, and checkout cannot be restarted while a payment is pending or confirmed - a restart always begins from a new quote.
- Two Phase 2 defects reported, not fixed: `claim-form.tsx:133` passes the deep-linked territory as `placeholder` instead of `defaultValue`, so `/claim?territory=...` submits an empty reference; and this file begins with three corrupt `  5 | ...` gutter lines from commit `23db0c7`, while its Current Phase section still reads Phase 2 as in progress with public APIs planned.

### Codex -> Inception/Claude - Phase 3 design review approval (2026-09-02)

- Status: APPROVED WITH CHANGES. `docs/PHASE3_DESIGN.md` section 15 is the implementation authority wherever earlier draft sections conflict.
- Required corrections before coding: no client-supplied return URL, amount, currency, owner id, or territory version; status tokens must have at least 256 bits of entropy and be stored as keyed digests; `Payment.status` uses `CONFIRMED` for money received, not `CAPTURED`; provider-confirmed payment plus failed ownership capture enters reconciliation/refund, not payment failed.
- Final model/API/task order are documented in `docs/PHASE3_DESIGN.md` sections 15.2 through 15.5. Capture must use the existing transaction-scoped `TerritoryOwnership` CAS primitive, Dodo specifics remain `UNVALIDATED - requires official Dodo docs review`, and no Phase 3 code should be implemented outside that order.

### Claude -> Backend - Phase 3 frontend implemented and FROZEN, five handoffs open (2026-09-02)

Frontend Phase 3 is implemented against the corrected contracts in `c67212a` and is now frozen. Scope will not expand until the backend quote/checkout/status endpoints exist and their real responses have been inspected. Frozen commits: `f9f248a`, `07788a4`, `4d099af`, `1e968b7`, `658b961`.

`apps/web` is authoritative for: `TakeoverPanel`, quote display, checkout initiation, the status route, `AttemptState` presentation, bounded polling, no-fake-success, and money-aware terminal semantics. It defines no Phase 3 domain types; every shape is imported from `@takeover/shared`. There is deliberately no fixture mode for takeover: a fixture quote invents a price, a fixture checkout invents a payment, and a fixture status invents an outcome for real money.

Contract verification performed against `c67212a` before implementing, by probing the built package at runtime: one authoritative `AttemptState`; terminal semantics correct (`RECONCILIATION_REQUIRED`, `CAPTURE_FAILED`, `LOST_TERRITORY_RACE`, `REFUND_PENDING` non-terminal, `CAPTURED`/`REFUNDED`/`QUOTE_EXPIRED` terminal, `PAYMENT_FAILED` terminal only with no amount charged); canonical `Money`; `statusToken` session-free with >=256 bits; `providerCheckoutUrl` HTTPS-only; `TAKEOVER_PRICE_CHANGED` and `STALE_TERRITORY_VERSION` distinct; `territoryVersion` opaque past `Number.MAX_SAFE_INTEGER`.

Five items the backend must settle before live integration:

1. **Quote request body.** The frontend sends `{ territorySlug }` to `POST /api/takeover-quotes`. `@takeover/shared` publishes a quote response but no request schema, so this is the one assumed shape in the slice. It is written in a single place, `src/lib/api/takeover.ts`. Confirm or correct it explicitly rather than letting the frontend discover it at runtime.
2. **`LOST_TERRITORY_RACE` must reach a money-terminal outcome.** It is now non-terminal, which is correct because the loser's payment still has to resolve, but it means the server must eventually transition the attempt to `REFUND_PENDING` -> `REFUNDED` or another approved settled state. Otherwise the status surface polls until its ten-minute budget expires and then tells the payer we stopped checking.
3. **Refund amount is not published.** The contract exposes `amountCharged` only. The frontend will not invent a refunded figure, so `REFUNDED` shows what was charged and nothing else. If a distinct refund amount is product-required, shared must publish it.
4. **`eligibilityReason` is a free-form string.** It is rendered verbatim when `checkoutAvailable` is false, and no recovery UX is built on it. A stable machine-readable enum is needed before the frontend can route someone to the right fix (verify email, await manager approval, and so on).
5. **Abandoned checkouts must age out server-side.** The status route ignores provider query parameters entirely as authority. If a cancelled or abandoned checkout is signalled only through the browser return URL, that attempt will sit in `CHECKOUT_CREATED` until the server ages it out.

When the endpoints land the frontend will inspect the real responses first, run focused live integration tests, then wire the existing seam. Components will not be redesigned unless the real contract forces it. Paths are centralised in `TAKEOVER_API_PATHS`, so a route correction is one line per resource.

## Recent Important Changes

- 2026-08-29: Phase 0 foundation verified with the reconciled stable version matrix.
- 2026-08-29: V1 traditional authentication was removed in favor of passwordless company-scoped capabilities.
- 2026-08-30: Phase 1 company-claim identity contracts, schema, security primitives, email boundary, company/access workflows, recovery request seam, and reference-only intent preparation were implemented and verified against PostgreSQL.
- 2026-08-30: Phase 1 frontend company-identity surfaces were implemented in `apps/web` against the real `@takeover/shared` contracts; runtime integration remains unverified without a provisioned database.
- 2026-08-31: Phase 1 loopback runtime identity smoke verified the real Fastify/passwordless flow against the dedicated PostgreSQL test database and development-only in-memory email capture. Production email delivery remains explicitly unavailable.
- 2026-08-31: Phase 2 Task 1 published framework-neutral territory and ownership contracts in `@takeover/shared`; by 2026-09-02 the database-backed public read APIs are implemented and verified.
- 2026-08-30: Phase 2 territory/ownership design was approved with suspended-owner truth, no controlled-correction source, required `btree_gist`, five-entry history preview, and a small reviewed seed requirement.

## Phase 3 — Pricing, Checkout, Capture, Payment (DESIGN READY)

The Phase 3 design has been documented in `docs/PHASE3_DESIGN.md`. No implementation changes have been made; only documentation has been updated to reflect the upcoming work.
