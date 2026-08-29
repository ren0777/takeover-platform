# TakeOver.com Shared Memory

## Current Phase

**Phase 0 — Foundation: IN PROGRESS / UNVALIDATED.** The design specification and implementation plan are approved and committed. Canonical documentation is being established before scaffold code.

## What Works

- **IMPLEMENTED NOW:** Git repository on `main`.
- **IMPLEMENTED NOW:** Approved Phase 0 design and detailed implementation plan.

## Partially Implemented

- Six canonical documents are being created.
- Monorepo, applications, packages, tests, and verification are not yet present.

## Broken / Known Issues

- No runnable application exists yet.
- No PostgreSQL instance is provisioned or validated.

## Important Architectural Decisions

- pnpm monorepo with independent `apps/web` and `apps/api` deployment units.
- Fastify API with strict TypeScript, thin routes, plugins for infrastructure, and business logic outside HTTP.
- `packages/shared` is the canonical browser/server-safe contract package and cannot import Fastify or Prisma.
- `packages/database` exclusively owns Prisma and PostgreSQL access.
- `packages/config` contains build-time configuration only.
- No Redis, queues, workers, providers, or product modules in Phase 0.
- Money uses safe integer minor units and uppercase three-letter currency codes.

## API Contracts

**PLANNED FOR PHASE 0:**

- `GET /health` → `{ "data": { "status": "ok" } }`
- `GET /ready` → `{ "data": { "status": "ready", "checks": { "application": "ok" } } }`
- Errors → `{ "error": { "code": string, "message": string, "requestId"?: string, "details"?: unknown } }`

No product API contract exists.

## Database Changes

No database schema or migration exists yet. A minimal PostgreSQL/Prisma infrastructure foundation is planned; no product model is implemented.

## Pending Frontend Requirements

- Claude can begin product design only after Phase 0 exports and workspace commands are verified.
- Frontend must consume shared domain/API contracts from `@takeover/shared`, not duplicate them.
- Frontend must never import `@takeover/database` or imply backend-confirmed success from fixtures.
- Approved data-access seam: server components depend on `lib/data/*` functions, never on fixtures or `fetch` directly. A per-resource switch selects fixture or live source so resources go live one at a time as endpoints land, with no parallel logic retained.
- Fixtures are development-only, clearly labeled, never imported in production, and must never represent payment, verification, ownership, or any irreversible state as successful while no backend exists.
- `@takeover/shared` is the single canonical source of shared domain contracts. `apps/web` may define frontend-only view models, but they must be clearly separated from domain/API contracts and must not restate them.

## Pending Backend Requirements

- Complete and verify Phase 0 only.
- Design Phase 1 identity separately after explicit approval; do not start it automatically.
- Product APIs, payment providers, ownership, real-time events, and verification remain planned.

## Current Blockers

- None for local Phase 0 scaffolding.
- Live PostgreSQL migration/application evidence may remain unavailable if no database is provisioned; schema validation does not require one.

## Agent Handoffs

### Codex → Claude

Not ready for integration yet. Phase 0 will provide `apps/web`, `@takeover/shared`, and verified commands. Until completion, avoid relying on uncommitted package paths or contracts.

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

## Recent Important Changes

- 2026-08-29: Approved lean Phase 0 design committed.
- 2026-08-29: Detailed implementation plan committed; execution started.

