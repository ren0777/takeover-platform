# TakeOver.com Shared Memory

## Current Phase

**Phase 0 — Foundation: IMPLEMENTED NOW / ACCEPTANCE VERIFIED. Phase 1 — Company + Claim Identity: DESIGN APPROVED, IMPLEMENTATION NOT STARTED.** Live PostgreSQL migration application and runtime queries remain **UNVALIDATED / NEEDS REVIEW**. Do not implement Phase 1 until its specification is reviewed and an implementation plan is approved.

## What Works

- **IMPLEMENTED NOW:** Git repository on `main`.
- **IMPLEMENTED NOW:** Approved Phase 0 design and detailed implementation plan.
- **IMPLEMENTED NOW:** Six canonical docs and root pnpm/config foundation; `pnpm install` succeeded.
- **IMPLEMENTED NOW:** `@takeover/shared` API envelopes, stable errors, constants, and integer-minor-unit money primitives.
- **IMPLEMENTED NOW:** Prisma 7 schema/config, generated-client lifecycle, infrastructure migration, and offline validation/diff.
- **IMPLEMENTED NOW:** Fastify API config validation, structured logging, safe errors, `/health`, `/ready`, and graceful shutdown.
- **IMPLEMENTED NOW:** Minimal Next.js 15/React 19/Tailwind v4 web shell.
- **IMPLEMENTED NOW:** 31 tests and the complete Phase 0 acceptance suite pass.

## Partially Implemented / Unvalidated

- The PostgreSQL adapter and migration exist, but no live PostgreSQL server was contacted.
- Next.js standard production output is verified. Optional standalone packaging is unvalidated because Windows denied pnpm symlink creation.

## Broken / Known Issues

- No product API, company/contact identity, email delivery, management capability, territory, bidding, payment, ownership, activity, season, battle, or admin functionality exists.
- No PostgreSQL instance is provisioned; `prisma migrate deploy` and runtime queries are unvalidated.
- Claude observed an intermittent cold-start timeout in `apps/api/test/health.test.ts` under full-suite parallel load. It passes in isolation. Baseline evidence on 2026-08-30 passed under the full workspace run, with the file completing in 628 ms and its first test in 599 ms. Do not mask a real startup defect; gather repeated-load evidence before adding an explicit timeout or optimizing setup.

## Important Architectural Decisions

- pnpm monorepo with independent `apps/web` and `apps/api` deployment units.
- Fastify API with strict TypeScript, thin routes, plugins for infrastructure, and business logic outside HTTP.
- `packages/shared` is the canonical browser/server-safe contract package and cannot import Fastify or Prisma.
- `packages/database` exclusively owns Prisma and PostgreSQL access.
- `packages/config` contains build-time configuration only.
- No Redis, queues, workers, providers, or product modules in Phase 0.
- Money uses safe integer minor units and uppercase three-letter currency codes.
- Stable Phase 0 versions: Next.js `15.5.24`, React/React DOM `19.2.8`, TypeScript `5.9.3`, Tailwind CSS `4.3.3`, Fastify `5.12.1`, Zod `4.5.2`, and Prisma CLI/client/PostgreSQL adapter `7.10.0` exactly matched.
- Prisma 7 uses `prisma.config.ts`, explicit generated-client output, and the PostgreSQL driver adapter. Prisma 8 release candidates and TypeScript 7 are excluded.
- V1 has no `User` model, passwords, signup/login, password reset, global end-user session, or generic authenticated dashboard.
- Approved identity flow: opaque single-use email link with at least 256 bits of secret entropy -> exchange -> short-lived Secure/HttpOnly company-scoped management session. Raw secrets are never persisted/logged; grants and sessions are revocable.
- Company identity, verified contact, management authority, payment, and ownership are separate facts. `contact_verified` is sufficient; matching-domain email, DNS access, incorporation, and company-domain email are not required.
- New companies begin as private, expiring, non-participating drafts. Email verification may authorize that draft; only a later confirmed capture can activate it and establish ownership.
- A different verified contact for an existing managed company creates a pending `CompanyAccessRequest`; checkout and mutations remain blocked until an existing manager approves or manual recovery succeeds. Payment never grants access.
- `TakeoverIntent` snapshots are explanatory only and never lock price. Checkout must later revalidate owner/version/current amount/legal minimum/currency and require explicit review when stale.
- Dodo Payments is the planned Phase 3 V1 provider behind `PaymentProvider`/`DodoPaymentProvider`. No Dodo SDK exists, and its current signature/event/retry/refund behavior remains **UNVALIDATED / NEEDS REVIEW**.
- Locked Phase 1 TTLs: verification and management/access-review links 15 minutes; management session 8 hours; access request 7 days; company draft 24 hours; recovery request 7 days.
- Management cookies default to opaque server-resolved IDs with `HttpOnly`, production `Secure`, `SameSite=Lax`, no `Domain`, and `Path=/api`.
- Phase 1 uses an `EmailProvider` interface plus an in-memory dev/test-only transport. Production delivery stays configurable/unavailable until a provider is selected; raw link tokens never enter normal logs.
- A normalized website already claimed by an authoritative company always enters existing-company access/recovery handling. Drafts never silently merge or become a second authoritative company.

## API Contracts

**IMPLEMENTED NOW:**

- `GET /health` → `{ "data": { "status": "ok" } }`
- `GET /ready` → `{ "data": { "status": "ready", "checks": { "application": "ok" } } }`
- Errors → `{ "error": { "code": string, "message": string, "requestId"?: string, "details"?: unknown } }`

Both success endpoints include `meta.requestId`; `/health` also includes `uptimeSeconds`. `/ready` checks application initialization only and intentionally makes no database-readiness claim. No product API contract exists.

## Database Changes

Prisma owns one infrastructure-only `SystemMetadata` model and the committed `20260829000000_initialize_foundation` migration. Prisma CLI, client, and PostgreSQL adapter are exactly `7.10.0`. Offline generation, validation, and migration diff pass; live application is unvalidated. No product model exists.

## Important Commands

- `pnpm dev` — run web and API development servers.
- `pnpm build` — build all packages and deployable applications.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` — workspace validation.
- `pnpm format` / `pnpm format:check` — formatting.
- `pnpm db:generate` / `pnpm db:validate` — offline Prisma checks; set `DATABASE_URL` to a syntactically valid PostgreSQL URL.
- `pnpm smoke:api` — start the compiled API, probe health/readiness/404, and verify graceful shutdown.

## Workspace Structure

```text
apps/
  api/       Fastify runtime, config, health plugin, tests
  web/       Next.js App Router shell, Tailwind v4, tests
packages/
  config/    shared TypeScript and ESLint build configuration
  database/  Prisma 7 config/schema/migration/client lifecycle
  shared/    framework-neutral Zod contracts, constants, money
scripts/
  smoke-api.mjs
docs/
  PRD.md ARCHITECTURE.md RULES.md PHASES.md DESIGN.md MEMORY.md
```

## Pending Frontend Requirements

- Claude can safely work inside `apps/web`; its independent build, lint, typecheck, and test commands are verified.
- Claude can import browser-safe contracts from `@takeover/shared` and must coordinate changes to that package.
- Frontend must consume shared domain/API contracts from `@takeover/shared`, not duplicate them.
- Frontend must never import `@takeover/database` or imply backend-confirmed success from fixtures.
- Approved data-access seam: server components depend on `lib/data/*` functions, never on fixtures or `fetch` directly. A per-resource switch selects fixture or live source so resources go live one at a time as endpoints land, with no parallel logic retained.
- Fixtures are development-only, clearly labeled, never imported in production, and must never represent payment, verification, ownership, or any irreversible state as successful while no backend exists.
- `@takeover/shared` is the single canonical source of shared domain contracts. `apps/web` may define frontend-only view models, but they must be clearly separated from domain/API contracts and must not restate them.

## Pending Backend Requirements

- Phase 1 design is approved at `docs/superpowers/specs/2026-08-29-phase-1-company-claim-identity-design.md`; implementation has not started and requires a reviewed implementation plan.
- Implement the approved Phase 1 plan after review. Production email provider, any cross-site cookie/CORS change, and manual-reviewer authorization remain unresolved.
- Phase 1 may implement company drafts/contacts, email challenges, grants, scoped sessions, access requests, approval/rejection, recovery request architecture, rate limits, and audit records only.
- Territory/ownership remain Phase 2. Pricing, Dodo checkout/webhooks/payment records, and atomic capture remain Phase 3.
- Product APIs, payment providers, ownership, real-time events, and verification remain planned.

## Current Blockers

- No blocker remains for the approved local/offline Phase 0 acceptance criteria.
- Live PostgreSQL migration/application evidence is blocked by the absence of a provisioned database.

## Agent Handoffs

### Codex → Claude

Ready:

- `apps/web` is an independently buildable Next.js 15 shell that Claude can extend.
- `@takeover/shared` exports `ApiSuccess`, `ApiError`, envelope schemas, `ERROR_CODES`, `Money`, `moneySchema`, `createMoney`, `isMoney`, currency validation, and health constants.
- `apps/api` serves `GET /health` and `GET /ready`; no product endpoints exist.

Boundaries:

- Do not import `@takeover/database` from the web app.
- Do not duplicate shared domain/API contracts inside `apps/web`.
- Product success, verification, ownership, payment, rankings, and real-time events remain unavailable and must not be fabricated.

### Claude → Codex

Frontend product direction is approved and recorded in `DESIGN.md` (Value Mosaic board; ambient-plus-bursts liveness). No frontend product code exists yet. The following backend capabilities are required before the corresponding frontend work can be honestly completed. None of these are blocking Phase 0.

**Requested contract addition — `displayWeight: number` on territory.**
Reason: the Value Mosaic sizes tiles by importance (`flagship` 2×2, `major` 2×1, `standard` 1×1). The frontend currently derives tier from current price as a temporary presentation heuristic, which makes physical prominence a frontend-invented property. An authoritative `displayWeight` — determined by product rules or admin configuration — moves that decision to the backend where it belongs. Until it exists, only development fixtures compute a local weight.

**Requested capability — authoritative real-time event stream (SSE preferred).**
Reason: the approved liveness model reacts to real events only. `lib/realtime` will define an integration boundary and nothing more; it will not fabricate a connection or synthesize events. Events needed: territory captured, company dethroned, territory contested, empire milestone, leaderboard #1 change, battle begins/ends, season winner declared.

**Requested endpoints — takeover and payment flow, including stale-price response.**
Reason: the capture flow stops at a clearly labeled payment-not-connected boundary until these exist. The stale-price response must carry the new owner, the new current price, and the new minimum takeover amount so the modal can explain the change and require review again. The frontend must never auto-charge a revised amount.

**Requested fields — territory history including `previousOwner.logoUrl`.**
Reason: the territory detail page shows ownership history with logos; without the logo URL the history section degrades to text-only.

**Approved Phase 1 direction — passwordless company capabilities.**

The canonical flow is: `TAKE OVER` → company/contact details → verify email → prepare intent → obtain existing-company approval when required → review current quote → Phase 3 Dodo checkout → verified webhook → backend-confirmed ownership. V1 has no login/signup/password UI.

Frontend states may cover verification required/sent/expired/invalid, access pending/approved/rejected/expired/cancelled, manual recovery pending, and stale-price review. Until backend endpoints exist, fixtures must not claim a link was delivered, a session/grant exists, payment succeeded, or ownership changed.

Required Phase 1 contracts/endpoints are proposed in the approved specification. Management context must always name the one authorized company; there is no global "logged-in user" response.

**Requested contracts — shared domain types do not exist yet.**
`@takeover/shared` currently exports only `ApiSuccess`, `ApiError`, `apiSuccessSchema`, `apiErrorSchema`, `ERROR_CODES`, `ErrorCode`, `Money`, `moneySchema`, `createMoney`, `isMoney`, `CURRENCY_CODE_PATTERN`, `DEFAULT_CURRENCY`, and `HEALTH_STATUS`. There are no `Territory`, `Company`, `Season`, `Battle`, `LeaderboardEntry`, or `ActivityEvent` contracts.

These are domain contracts shared with the API, so per `RULES.md` they belong in `@takeover/shared` and must not be authored canonically inside `apps/web`. Codex should publish them as part of Phase 2 (territories) and Phase 4 (competition).

Until they land, `apps/web` defines clearly-labeled **provisional presentation view models** in a single quarantined module. They are explicitly not canonical, are consumed only through the data-access seam, and are to be deleted and replaced by the `@takeover/shared` contracts when those exist. This is recorded so the duplication is deliberate, visible, and temporary rather than silent.

## Recent Important Changes

- 2026-08-29: Approved lean Phase 0 design committed.
- 2026-08-29: Detailed implementation plan committed; execution started.
- 2026-08-29: A concurrent alternate plan edit was detected and preserved separately. Next.js 16 was rejected and Next.js 15 retained; Prisma 7 was retained with CLI/client/adapter versions matched exactly. Useful exact-version, TDD, and API-smoke improvements were reconciled into the canonical plan because the approved goal is a stable foundation, not adoption of newer majors by default.
- 2026-08-29: Phase 0 implementation and acceptance verification completed locally/offline; live PostgreSQL application remains unvalidated.
- 2026-08-29: Product direction changed — V1 drops password authentication in favour of passwordless, company-scoped email capabilities. Frontend auth screens are cancelled.
- 2026-08-29: Phase 1 company-claim identity design approved and canonical docs reconciled. Existing-company requests remain pending until approval; Dodo Payments replaces Stripe-first planning for Phase 3. No Phase 1 code or provider integration was started.
