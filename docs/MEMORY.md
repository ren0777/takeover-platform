# TakeOver.com Shared Memory

## Current Phase

**Phase 0 — Foundation: IMPLEMENTED NOW / VERIFIED. Phase 1 — Company + Claim Identity: IMPLEMENTED NOW / VERIFIED in local development and a dedicated PostgreSQL 17 test database.**

**Phase 2 — Territories + Authoritative Ownership: IN PROGRESS.** Task 1 shared contracts are implemented; database schema, repositories, ownership transitions, seed data, and public APIs remain PLANNED.

## What Works

- pnpm monorepo with independently buildable `apps/web` and `apps/api`.
- Fastify health/readiness endpoints, structured logging, validated configuration, and graceful shutdown.
- Framework-neutral Phase 1 contracts in `@takeover/shared`.
- Company drafts, normalized website collision handling, verified contact email, purpose-bound email challenges, company-scoped grants/sessions, existing-company access requests, manager approval/rejection, manual-recovery request state, durable rate limits, and audit records.
- Opaque link/session tokens use at least 256 bits of randomness; raw tokens are not persisted or written to normal logs.
- Identity-side `TakeoverIntent` preparation stores reference-only quote snapshots and always returns `checkoutAvailable: false`.
- Development/test email provider and loopback-only opt-in capture endpoint.
- Both Prisma migrations apply cleanly to the dedicated PostgreSQL test database; 24 live integration/concurrency tests pass.

## Partially Implemented

- Manual recovery request creation is implemented; operator approval execution is unavailable because no operator identity/authorization system exists.
- Email delivery has an explicit provider interface, but only the development/test transport exists.
- `TakeoverIntent` is only an identity/preparation seam. It has no authoritative territory, pricing, payment, checkout, or capture behavior.

## Broken / Known Issues

- Production email delivery is unavailable until a real provider is deliberately selected.
- `@prisma/adapter-pg` 7.10.0 emits a `pg` deprecation warning during the deliberate concurrent approve/reject test. A traced stack points inside the Prisma adapter transaction interpreter; assertions and database invariants pass. Track upstream before adopting `pg` 9 and do not suppress the warning.
- Claude reported an intermittent Fastify test cold-start timeout under full-suite parallel load. Five consecutive API suites first passed in 623–822 ms; under heavier concurrent tooling, the first HTTP app injection reproduced at 13.3 seconds while every subsequent HTTP test took 23–86 ms. The first cold-start test in each affected file now has a scoped 20-second timeout. The independent compiled production startup smoke retains its 5-second deadline, so runtime startup regressions are not masked.

## Important Architectural Decisions

- V1 has no `User`, password, signup/login, password reset, global session, or generic authenticated dashboard.
- Company identity is distinct from email verification, management authority, payment, and ownership.
- `contact_verified` is sufficient for V1; contact and website domains need not match.
- Raw capability tokens are delivered only through the email-provider boundary, then exchanged for opaque, short-lived, server-resolved company-scoped sessions.
- Management cookies use `HttpOnly`, production `Secure`, `SameSite=Lax`, no `Domain`, and `Path=/api`; state-changing routes also require an exact trusted Origin and double-submit CSRF secret.
- Existing authoritative website collisions enter the access-request flow; they never silently merge, duplicate, or grant authority.
- Manual recovery cannot grant authority in Phase 1.
- PostgreSQL is the durable source of truth for challenges, sessions, requests, throttles, intents, and audits. Redis/queues/workers are absent.
- Dodo Payments remains PLANNED for Phase 3 behind a provider-neutral interface and is UNVALIDATED / NEEDS REVIEW.
- Phase 2 will treat `TerritoryOwnership` as the sole ownership source of truth; `Territory` will not duplicate current/previous owner, bid, or price fields.
- Phase 2 public states are `unclaimed`, `claimed`, and `disabled`. `contested` is absent until authoritative Phase 3 bidding can define it.
- Phase 2 `displayWeight` is backend-authoritative on `1..100` and has no price, ownership, volume, company-size, or adjacency meaning. Frontend flagship/major/standard bands remain presentation-only.
- Suspended owners remain publicly named with `status: suspended`; suspension and future moderation redaction do not rewrite ownership.
- Phase 2 requires PostgreSQL `btree_gist` for non-overlapping ownership timelines. Unsupported production provider capability is a deployment blocker.
- Territory detail will preview five history entries through one server constant; full history is cursor-paginated.

## API Contracts

All success responses use `{ data, meta: { requestId } }`; errors use the stable `ApiError` envelope.

- `GET /health`
- `GET /ready` — application readiness only; no database-readiness claim
- `POST /api/company-claims`
- `POST /api/email-verifications`
- `POST /api/email-verifications/exchange`
- `POST /api/company-management-links`
- `POST /api/company-management-links/exchange`
- `GET /api/company-management/context`
- `DELETE /api/company-management/session`
- `POST /api/company-access-requests/:id/approve`
- `POST /api/company-access-requests/:id/reject`
- `POST /api/company-recovery-requests`
- `PUT /api/takeover-intents/:id/preparation`
- `GET /__dev/email-captures/:messageId` — development only, explicit opt-in, loopback only

Cookie-authenticated mutations require `takeover_management`, `takeover_management_csrf`, `X-CSRF-Token`, and the configured exact Origin. Company authority is resolved server-side.

## Database Changes

`packages/database` is the only Prisma owner. Applied migrations:

- `20260829000000_initialize_foundation`
- `20260829200842_add_company_claim_identity`

Phase 1 models: `Company`, `CompanyContact`, `CompanyVerification`, `EmailVerificationChallenge`, `CompanyManagementGrant`, `CompanyManagementSession`, `CompanyAccessRequest`, `TakeoverIntent`, `AuditLog`, and `SecurityRateLimitBucket`. There is no `User`, Territory, ownership, bid, or payment model.

## Pending Frontend Requirements

- Consume the Phase 1 contracts from `@takeover/shared`; do not duplicate canonical company identity contracts.
- Treat every claim/intent result as pre-checkout because `checkoutAvailable` is always `false`.
- Build verification, access-pending/decision, manual-recovery-pending, and reference-quote states without implying email delivery, authority, payment, or ownership until the API confirms the relevant state.
- Keep Claude’s frontend-only work inside `apps/web`; Codex preserved it unchanged.

## Pending Backend Requirements

- Production email-provider selection and integration.
- Separately reviewed operator identity/authorization before manual recovery can be executed.
- Phase 2 shared contracts, Prisma territory/ownership schema, `btree_gist` constraints, reviewed deterministic seed, public read APIs, internal transaction-bound ownership primitive, and nullable `TakeoverIntent.territoryId` seam.
- Phase 3 pricing, provider-neutral payments, Dodo adapter, checkout, verified webhooks, reconciliation/refunds, and atomic capture.
- Authoritative Phase 2 `displayWeight: number` for territory presentation and a later SSE activity stream; neither exists yet.

## Current Blockers

- No blocker for Phase 1 local completion.
- Production deployment is blocked on production PostgreSQL configuration, production email delivery, hosting topology, and operational review.
- Manual recovery execution is intentionally unavailable.

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

- Authoritative constants safe to consume: `TERRITORY_PUBLIC_STATUSES`, `TERRITORY_AVAILABILITY_STATUSES`, and `OWNERSHIP_SOURCES`.
- Authoritative schemas safe to consume: `territoryCategorySchema`, `territoryVisualMetadataSchema`, `companyPublicSummarySchema`, `territoryOwnershipSummarySchema`, `territoryHistoryEntrySchema`, `territorySummarySchema`, `territoryDetailSchema`, `companyTerritoriesSchema`, `territoryVersionSchema`, `displayWeightSchema`, `territoryStatusSchema`, `territoryAvailabilityStatusSchema`, `ownershipSourceSchema`, `paginationQuerySchema`, `pageMetaSchema`, `territoryListQuerySchema`, `territoryPageSchema`, and `territoryHistoryPageSchema`.
- Authoritative inferred types safe to consume: `TerritoryCategory`, `TerritoryVisualMetadata`, `CompanyPublicSummary`, `TerritoryOwnershipSummary`, `TerritoryHistoryEntry`, `TerritorySummary`, `TerritoryDetail`, `CompanyTerritories`, `PaginationQuery`, `PageMeta`, `TerritoryListQuery`, `TerritoryPage`, and `TerritoryHistoryPage`.
- Stable error codes now include `TERRITORY_NOT_FOUND`, `TERRITORY_CATEGORY_NOT_FOUND`, `INVALID_CURSOR`, `STALE_TERRITORY_VERSION`, `TERRITORY_DISABLED`, `OWNERSHIP_CONFLICT`, and `OWNERSHIP_HISTORY_INVALID`.
- `displayWeight` is an authoritative integer contract constrained to `1..100`; the frontend may map it to presentation tiers, but mosaic position and physical adjacency have no gameplay meaning.
- `version` and `territoryVersion` are positive decimal strings over JSON. `CompanyPublicSummary` is a privacy-safe projection and does not replace the existing Phase 1 `Company` aggregate.
- These are contracts only. Public territory APIs and database-backed ownership are not implemented yet; fixtures must remain development-only. No contested, pricing, bid, payment, checkout, ownership mutation route, leaderboard, or live-event contract is available.

## Recent Important Changes

- 2026-08-29: Phase 0 foundation verified with the reconciled stable version matrix.
- 2026-08-29: V1 traditional authentication was removed in favor of passwordless company-scoped capabilities.
- 2026-08-30: Phase 1 company-claim identity contracts, schema, security primitives, email boundary, company/access workflows, recovery request seam, and reference-only intent preparation were implemented and verified against PostgreSQL.
- 2026-08-30: Phase 1 frontend company-identity surfaces were implemented in `apps/web` against the real `@takeover/shared` contracts; runtime integration remains unverified without a provisioned database.
- 2026-08-31: Phase 1 loopback runtime identity smoke verified the real Fastify/passwordless flow against the dedicated PostgreSQL test database and development-only in-memory email capture. Production email delivery remains explicitly unavailable.
- 2026-08-31: Phase 2 Task 1 published framework-neutral territory and ownership contracts in `@takeover/shared`; database-backed territory APIs and ownership remain planned.
- 2026-08-30: Phase 2 territory/ownership design was approved with suspended-owner truth, no controlled-correction source, required `btree_gist`, five-entry history preview, and a small reviewed seed requirement.
