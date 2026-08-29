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

## Recent Important Changes

- 2026-08-29: Approved lean Phase 0 design committed.
- 2026-08-29: Detailed implementation plan committed; execution started.

