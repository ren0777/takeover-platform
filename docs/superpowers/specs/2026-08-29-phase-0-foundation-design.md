# TakeOver.com Phase 0 Foundation Design

**Status:** Approved for implementation on 2026-08-29

## Purpose

Phase 0 establishes a small, runnable, independently deployable monorepo for TakeOver.com. It creates the technical and documentation foundation needed for later identity, territory, bidding, payment, and ownership work without pretending those systems exist.

The product remains anchored to:

> See territory → beat current price → capture territory → defend it → build an empire.

Phase 0 does not implement that gameplay loop. It makes later implementation safe, explicit, and testable.

## Scope Boundary

### Included

- Initialize Git with `main` as the initial branch.
- Create a pnpm workspace containing `apps/web`, `apps/api`, `packages/database`, `packages/shared`, and `packages/config`.
- Create the six canonical project documents in `docs`.
- Provide a minimal Next.js 15, React 19, TypeScript, and Tailwind CSS v4 web application.
- Provide a minimal Fastify TypeScript API with separated construction and process startup.
- Validate runtime API configuration.
- Use Fastify/Pino structured logging and graceful process shutdown.
- Expose liveness and readiness endpoints.
- Provide framework-neutral shared contracts, constants, and money primitives.
- Establish PostgreSQL and Prisma configuration, client lifecycle, an initial migration foundation, and schema validation.
- Provide strict shared TypeScript configuration, ESLint configuration, Prettier configuration, Vitest, and root workspace commands.
- Verify installation, static analysis, tests, builds, Prisma validation, API startup, and health responses.

### Excluded

- Product authentication, users, companies, territories, bids, ownership, payments, webhooks, seasons, leaderboards, battles, activity streaming, and admin APIs.
- Redis, queues, background workers, schedulers, or distributed coordination.
- Stripe, Razorpay, authentication, or email provider SDKs.
- Empty product-module directories or placeholder service classes.
- A complete product database model.
- Deployment provisioning or provider-specific infrastructure.

## Repository Architecture

```text
takeover/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── plugins/
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   └── test/
│   └── web/
│       └── src/app/
├── packages/
│   ├── config/
│   ├── database/
│   │   └── prisma/
│   └── shared/
├── docs/
│   ├── superpowers/specs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── RULES.md
│   ├── PHASES.md
│   ├── DESIGN.md
│   └── MEMORY.md
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

The tree describes intended responsibility boundaries, not a requirement to create files with no current behavior. Supporting configuration files may be added where the selected tools require them.

## Workspace Responsibilities

### `apps/web`

`apps/web` is the frontend deployment unit. It contains only a minimal App Router shell, global Tailwind v4 styles, metadata, and a smoke test needed to prove the application builds. It consumes shared contracts through `@takeover/shared` when product work begins, but Phase 0 does not add speculative UI or API integration.

Claude Code can work primarily inside `apps/web`. Changes to shared contracts require coordination through `docs/MEMORY.md` because both applications consume them.

### `apps/api`

`apps/api` is the backend deployment unit. `app.ts` creates and configures a Fastify instance without binding a network port, allowing tests to use Fastify injection. `server.ts` owns process concerns: configuration loading, listening, signal handling, graceful closure, startup failures, and exit codes.

Infrastructure uses focused Fastify plugins. Phase 0 includes only behavior required by the runnable foundation, such as health routes. It does not create empty business modules.

Future route handlers will parse transport input and call services. Financial rules and ownership transitions will live in domain/services, while repositories will isolate Prisma access. Fastify decorators and plugins may wire dependencies, but the codebase will not reproduce Nest-style dependency injection.

### `packages/shared`

`packages/shared` is safe for browser and server imports. It contains:

- Zod schemas and inferred TypeScript types for API envelopes.
- Stable error-code conventions.
- domain constants that do not depend on runtime infrastructure.
- money primitives that require integer minor units and normalized ISO currency codes.

It must not import Fastify, Prisma, Node-only secret configuration, or provider SDKs. Its money helpers validate and carry values; they do not perform currency conversion or floating-point arithmetic.

### `packages/database`

`packages/database` owns the Prisma schema, migrations, generated client, and database lifecycle utilities. The initial schema configures PostgreSQL and creates a minimal migration foundation without modeling unimplemented product concepts. A small internal metadata model may be used only if Prisma requires a concrete schema for migration verification; it must be labeled infrastructure rather than a product model.

The package exposes explicit `getDatabaseClient` and `disconnectDatabase` lifecycle functions. Applications must not create scattered `PrismaClient` instances.

### `packages/config`

`packages/config` contains shared build-time configuration: strict TypeScript bases and ESLint configuration. It contains no secrets, environment parsing, game rules, or runtime business settings.

## API Runtime Design

The API validates environment values with Zod before opening a port. Phase 0 settings are limited to `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`, and `DATABASE_URL` where database access requires it. Invalid values fail startup with a clear error and a non-zero exit code.

Fastify provides JSON logs through Pino. Logs use stable event/context fields and do not include secrets. Request IDs are retained for correlation.

Endpoints:

- `GET /health` reports process liveness and does not require database access.
- `GET /ready` reports readiness. In Phase 0 it verifies the application is initialized; database probing is introduced only when an API workflow actually requires a live database connection, and the endpoint must state its checks accurately.

Both endpoints return a shared success envelope. Unknown routes and validation failures use the shared error envelope without exposing stack traces in production.

`SIGINT` and `SIGTERM` stop accepting new requests, close Fastify, disconnect the shared Prisma client if it was initialized, and then exit. A second fatal shutdown condition may force a non-zero exit rather than hanging indefinitely.

## Shared Contract Design

Successful responses use:

```ts
type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};
```

Errors use:

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
};
```

Money values use an explicit integer minor-unit representation:

```ts
type Money = {
  amountMinor: number;
  currency: string;
};
```

The Zod schema requires a safe integer amount and a three-letter uppercase currency code. Phase 0 permits non-negative amounts; later bid-specific schemas will impose positive minimums and legal bid rules on the server.

## Database Foundation

PostgreSQL is the future source of truth. The initial Prisma schema specifies PostgreSQL and a committed migration history. Prisma client generation and validation are available from root scripts.

Phase 0 does not claim that a database server is provisioned. Schema validation and client generation must work from `.env.example` values without connecting. Applying migrations and integration tests that require PostgreSQL are separate commands and remain unverified unless a database is available during implementation.

Later financial workflows will use interactive Prisma transactions with database-enforced constraints and appropriate locking or optimistic concurrency. This is planned architecture and not implemented in Phase 0.

## Tooling and Commands

The root is private and pins pnpm through `packageManager`. Workspace packages use a consistent `@takeover/*` namespace.

Root scripts provide:

- `pnpm dev` to run web and API development processes.
- `pnpm build` to build all deployable applications and required packages.
- `pnpm typecheck` to type-check all workspaces.
- `pnpm lint` to lint all workspaces.
- `pnpm test` to run all automated tests once.
- `pnpm format` to apply Prettier.
- `pnpm format:check` to verify formatting.
- `pnpm db:generate` to generate Prisma Client.
- `pnpm db:validate` to validate the Prisma schema.

Turbo or another task orchestrator is intentionally omitted unless plain pnpm recursive scripts prove insufficient. CI can run the same commands without a separate local convention.

## Testing Strategy

Vitest is the common test runner.

- Shared-package unit tests prove API envelopes and money validation, including rejection of fractional, unsafe, negative, and malformed currency values.
- API tests construct the application through `app.ts` and use `fastify.inject` to verify liveness, readiness, envelopes, content type, and request IDs without opening a port.
- Web verification uses TypeScript, linting, a production Next.js build, and a small test for any extracted foundation-level behavior. No fragile visual snapshot is required.
- Prisma validation proves the schema parses and the client can be generated without requiring a running database.
- A runtime smoke check starts the compiled API on an available local port, calls both health endpoints, verifies HTTP 200 and response bodies, then terminates the process gracefully.

## Canonical Documentation

The implementation creates:

- `PRD.md`: the product requirements and scope, including user journeys, risks, metrics, V1, launch criteria, and future capabilities.
- `ARCHITECTURE.md`: actual and planned architecture, with all eight required Mermaid flows and honest status labels.
- `RULES.md`: engineering constitution, naming, data, API, security, testing, logging, migration, environment, and Git conventions.
- `PHASES.md`: Phases 0 through 9, each with objective, tasks, dependencies, status, acceptance criteria, tests, and risks.
- `DESIGN.md`: shared product personality, interaction, state, mobile, accessibility, and critical-action guidance for backend and frontend alignment.
- `MEMORY.md`: concise current state, contracts, commands, decisions, blockers, ownership boundaries, and Codex-to-Claude handoff.

Every material architecture statement is labeled `IMPLEMENTED NOW`, `PLANNED`, or `UNVALIDATED / NEEDS REVIEW`. Phase 0 is marked complete only after its acceptance checks pass; individual checklist items may be marked separately.

## Error Handling and Security Baseline

- Runtime configuration is validated before use.
- API errors use consistent codes and do not leak stack traces in production.
- Secrets are read only from server environments and never placed in shared browser-safe packages.
- Logs must redact conventional authorization, cookie, and credential fields.
- Dependencies are limited to the approved foundation.
- No route accepts or calculates financial state during Phase 0.
- `.env.example` contains names and safe illustrative values only.

## Verification and Completion Criteria

Phase 0 is complete only when current command output proves:

1. `pnpm install` succeeds.
2. web type checking succeeds.
3. API type checking succeeds.
4. linting succeeds.
5. tests succeed.
6. both production applications build.
7. the Prisma schema validates.
8. the compiled API starts successfully.
9. health and readiness endpoints respond correctly.
10. a repository scan confirms no prohibited dependencies, placeholder product modules, or undocumented architecture.

If any check depends on unavailable external infrastructure, it remains explicitly unvalidated and Phase 0 is not broadly described as complete. Verification results and blockers are recorded in `docs/MEMORY.md` and `docs/PHASES.md`.

## Handoff Boundary

At completion, Claude Code can safely develop `apps/web` and consume published exports from `@takeover/shared`. Claude should not copy API schemas or directly import `@takeover/database`.

Codex should next design Phase 1 identity as its own reviewed specification. Phase 1 does not begin automatically. Changes to shared contracts, environment requirements, or independently deployable application boundaries must be documented in `docs/MEMORY.md` before another agent relies on them.

