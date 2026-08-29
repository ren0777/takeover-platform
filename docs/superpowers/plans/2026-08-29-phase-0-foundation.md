# TakeOver.com Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the approved, documentation-first pnpm monorepo foundation without implementing TakeOver.com product features.

**Architecture:** A pnpm workspace contains independently deployable Next.js and Fastify applications. Framework-neutral contracts live in `@takeover/shared`, Prisma is owned only by `@takeover/database`, and build-time configuration lives in `@takeover/config`; canonical docs distinguish current, planned, and unvalidated systems.

**Tech Stack:** Node.js 24.12.0, pnpm 10.32.1, TypeScript 5.9.3 strict mode, Next.js 15.5.24, React 19.2.8, Tailwind CSS 4.3.3, Fastify 5.12.1, Zod 4.5.2, Prisma 7.10.0 with PostgreSQL, Vitest 3.2.7, ESLint 9.39.5, Prettier 3.9.6.

**Execution status:** Canonical docs are committed in `470d31c`; root workspace tooling and a successful `pnpm install` are committed in `c71f2f5`. Tasks 3 through 7 remain unimplemented and unverified.

## Approved Version Matrix

| Component                                | Phase 0 version                     | Decision                                               |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| Node.js                                  | 24.12.0 local; package floor `>=22` | Current local runtime with supported deployment floor  |
| pnpm                                     | 10.32.1                             | Pinned by root `packageManager`                        |
| Next.js                                  | 15.5.24                             | Next.js 16 concurrent proposal rejected                |
| React / React DOM                        | 19.2.8                              | Approved React major, exact matching pair              |
| TypeScript                               | 5.9.3                               | TypeScript 7 explicitly excluded                       |
| Tailwind CSS / PostCSS plugin            | 4.3.3                               | Approved Tailwind v4 line                              |
| Fastify                                  | 5.12.1                              | Approved API foundation                                |
| Zod                                      | 4.5.2                               | Shared and API validation                              |
| Prisma CLI / client / PostgreSQL adapter | 7.10.0 / 7.10.0 / 7.10.0            | Exact match required; Prisma 8 RC excluded             |
| PostgreSQL driver                        | `pg` 8.23.0                         | Required by the Prisma 7 PostgreSQL adapter            |
| Vitest                                   | 3.2.7                               | Preserves the successfully installed Phase 0 toolchain |

## Global Constraints

- Implement only the approved Phase 0 scope in `docs/superpowers/specs/2026-08-29-phase-0-foundation-design.md`.
- Do not add Redis, queues, workers, Stripe, Razorpay, authentication providers, email providers, or product APIs.
- Do not create empty product-module directories.
- Keep `apps/web` and `apps/api` independently buildable and deployable.
- Keep `packages/shared` free of Fastify, Prisma, Node-only configuration, and provider dependencies.
- Keep `packages/database` the sole owner of Prisma schema, generated client, migrations, and lifecycle.
- Use integer minor units and never floating-point arithmetic for money.
- Mark documentation claims as `IMPLEMENTED NOW`, `PLANNED`, or `UNVALIDATED / NEEDS REVIEW`.
- Do not mark Phase 0 complete unless every acceptance check has current evidence.
- Pin `prisma`, `@prisma/client`, and `@prisma/adapter-pg` to exactly `7.10.0`; do not use Prisma 8 prereleases.
- Use Prisma 7's `prisma.config.ts`, generated-client output, and PostgreSQL driver-adapter architecture rather than Prisma 6 configuration patterns.
- Preserve the successfully installed root toolchain; do not weaken peer-dependency checks through a permissive `.npmrc`.

---

## File Map

| Area       | Files                                                                                                                                                                                                                                                             | Responsibility                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Root       | `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.env.example`                                                                                                                  | Workspace orchestration and repository-wide policy                                       |
| Config     | `packages/config/package.json`, `packages/config/typescript/*.json`, `packages/config/eslint/base.mjs`                                                                                                                                                            | Shared build-time configuration only                                                     |
| Shared     | `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/*`, `packages/shared/test/*`                                                                                                                                                | Browser/server-safe contracts and money validation                                       |
| Database   | `packages/database/package.json`, `packages/database/tsconfig.json`, `packages/database/prisma.config.ts`, `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/*`, `packages/database/src/client.ts`, `packages/database/src/index.ts` | Exclusive Prisma 7 ownership and lifecycle                                               |
| API        | `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/config/env.ts`, `apps/api/src/plugins/health.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/test/*`                                                                             | Independently deployable Fastify runtime                                                 |
| Web        | `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/src/app/*`                                                                                                                                 | Minimal independently deployable Next.js shell                                           |
| Smoke test | `scripts/smoke-api.mjs`                                                                                                                                                                                                                                           | Starts the compiled API on a free port, probes endpoints, and verifies graceful shutdown |
| Docs       | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/RULES.md`, `docs/PHASES.md`, `docs/DESIGN.md`, `docs/MEMORY.md`                                                                                                                                                      | Canonical product, architecture, process, and handoff truth                              |

## Dependency Order

```text
Canonical docs and root policy
            |
            v
      shared config
       /    |    \
      v     v     v
 shared  database  app manifests
      \     |     /
       v    v    v
         API + Web
             |
             v
      final docs + verification
```

### Task 1: Create the Canonical Documentation Set

**Spec mapping:** Canonical Documentation; Scope Boundary; Handoff Boundary.

**Files:**

- Create: `docs/PRD.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/RULES.md`
- Create: `docs/PHASES.md`
- Create: `docs/DESIGN.md`
- Create: `docs/MEMORY.md`

**Interfaces:**

- Consumes: approved Phase 0 specification and the user's master product requirements.
- Produces: the constraints and status vocabulary every later task follows.

- [ ] **Step 1: Write `PRD.md` as product truth**

Include the product vision and fixed gameplay-loop quote; problem, users, value proposition, journeys, onboarding, verification, discovery, capture, ownership, bidding, payment, activity, empire, rankings, seasons, battles, Hall of Fame, sharing, admin, moderation, analytics, V1/future scope, non-goals, edge cases, success metrics, and launch criteria. Label the Phase 0 foundation `IMPLEMENTED NOW` only after verification; label every product capability `PLANNED` or `UNVALIDATED / NEEDS REVIEW`.

- [ ] **Step 2: Write `ARCHITECTURE.md` as actual plus planned architecture**

Document the workspace boundaries, API runtime, shared contracts, database ownership, configuration, logging, testing, deployment boundaries, observability, backup intent, environment variables, and external integrations. Include Mermaid diagrams for system architecture, user/company authentication, bid creation, payment flow, webhook confirmation, ownership transfer, real-time distribution, and season rollover. Every unimplemented diagram must begin with `Status: PLANNED` and must not imply a provider is connected.

- [ ] **Step 3: Write `RULES.md` as the engineering constitution**

Include all mandated money, authorization, validation, transaction, webhook, secret, logging, migration, configuration, external-provider, test, API compatibility, code-inspection, and correctness rules. Define lowercase-kebab file names where framework conventions allow, PascalCase types, camelCase values, `@takeover/*` package names, feature-local modules, API success/error envelopes, structured log fields, database naming, test placement, environment naming, and conventional commit guidance.

- [ ] **Step 4: Write `PHASES.md` with Phases 0 through 9**

For each phase provide objective, tasks, dependencies, current status, acceptance criteria, tests, and risks. Use checkbox evidence for Phase 0. Mark Phases 1 through 9 `PLANNED`; do not mark any product capability complete.

- [ ] **Step 5: Write `DESIGN.md` and `MEMORY.md`**

`DESIGN.md` defines personality, principles, interaction model, ownership/takeover/payment/loading/success/failure states, mobile and accessibility rules, avoided patterns, and critical action labels. `MEMORY.md` records the current phase, what works, partial/broken items, decisions, contracts, database changes, frontend/backend needs, blockers, handoffs, and recent changes without becoming a chronological dump.

- [ ] **Step 6: Cross-check plan and docs before scaffold code**

Run:

```powershell
rg -n "IMPLEMENTED NOW|PLANNED|UNVALIDATED / NEEDS REVIEW" docs/PRD.md docs/ARCHITECTURE.md docs/RULES.md docs/PHASES.md docs/DESIGN.md docs/MEMORY.md
rg -n "Redis|queue|worker|Stripe|Razorpay|auth provider|email provider" docs -g '*.md'
```

Expected: all six documents use honest status labels; prohibited Phase 0 infrastructure appears only as planned/excluded text.

- [ ] **Step 7: Commit the canonical docs**

```powershell
git add docs/PRD.md docs/ARCHITECTURE.md docs/RULES.md docs/PHASES.md docs/DESIGN.md docs/MEMORY.md
git commit -m "docs: establish takeover product foundations"
```

### Task 2: Establish Root Workspace and Shared Build Configuration

**Spec mapping:** Repository Architecture; Tooling and Commands; Error Handling and Security Baseline.

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `packages/config/package.json`
- Create: `packages/config/typescript/base.json`
- Create: `packages/config/typescript/node.json`
- Create: `packages/config/typescript/next.json`
- Create: `packages/config/eslint/base.mjs`

**Interfaces:**

- Consumes: Node 24 and pnpm 10.
- Produces: strict shared TypeScript and ESLint configuration; root commands used by every later task.

- [ ] **Step 1: Define the workspace and root commands**

Create a private ESM root package pinned to `pnpm@10.32.1`. Scripts must use `pnpm --recursive --if-present` and expose `dev`, `build`, `typecheck`, `lint`, `test`, `format`, `format:check`, `db:generate`, and `db:validate`. The `dev` script may use `pnpm --parallel --filter @takeover/web --filter @takeover/api dev`; no task orchestrator is added.

- [ ] **Step 2: Define shared build configuration**

`base.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, and `skipLibCheck`. `node.json` adds Node ESM settings. `next.json` adds DOM libraries and Next-compatible module resolution. ESLint uses flat config with TypeScript ESLint and ignores build/generated artifacts.

- [ ] **Step 3: Define formatting, ignore, and safe environment examples**

Prettier uses semicolons, single quotes, trailing commas, and 100-character width. Git ignores dependencies, builds, coverage, Next output, local environment files, logs, generated Prisma client artifacts where applicable, and OS/editor files. `.env.example` contains only safe illustrative `NODE_ENV`, `API_HOST`, `API_PORT`, `LOG_LEVEL`, and PostgreSQL `DATABASE_URL` values.

- [ ] **Step 4: Install the workspace dependencies**

Run:

```powershell
pnpm install
```

Expected: exit code 0 and a committed `pnpm-lock.yaml`.

- [ ] **Step 5: Verify root configuration parses**

Run:

```powershell
pnpm exec prettier --check package.json pnpm-workspace.yaml tsconfig.json packages/config
```

Expected: exit code 0.

- [ ] **Step 6: Commit workspace configuration**

```powershell
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json eslint.config.mjs .prettierrc.json .prettierignore .gitignore .env.example packages/config
git commit -m "chore: establish pnpm workspace tooling"
```

### Task 3: Build the Framework-Neutral Shared Package with TDD

**Spec mapping:** Shared Contract Design; `packages/shared`; Testing Strategy.

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/api.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/money.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/test/api.test.ts`
- Create: `packages/shared/test/money.test.ts`

**Interfaces:**

- Consumes: Zod only at runtime; shared build configuration.
- Produces: `apiSuccessSchema`, `apiErrorSchema`, `ApiSuccess<T>`, `ApiError`, `moneySchema`, `Money`, `createMoney`, `CURRENCY_CODE_PATTERN`, and `ERROR_CODES`.

- [ ] **Step 1: Write failing API-envelope and money tests**

Tests assert that success envelopes require `data`; error envelopes require `error.code` and `error.message`; `createMoney(1000, 'USD')` succeeds; fractional, negative, unsafe-integer, lowercase, and non-three-letter currency inputs fail.

- [ ] **Step 2: Run tests to verify the red state**

Run:

```powershell
pnpm --filter @takeover/shared test
```

Expected: failure because shared implementations do not exist.

- [ ] **Step 3: Implement minimal shared contracts**

Use Zod generic schema factories where necessary and infer exported types from schemas. Define `Money` with `amountMinor: number` and `currency: string`; validate `amountMinor` using `z.number().int().safe().nonnegative()` and currency using `/^[A-Z]{3}$/`. Freeze error-code/domain constants with `as const`. Do not import Node, Fastify, or Prisma.

- [ ] **Step 4: Verify shared package**

Run:

```powershell
pnpm --filter @takeover/shared test
pnpm --filter @takeover/shared typecheck
pnpm --filter @takeover/shared build
```

Expected: all commands exit 0.

- [ ] **Step 5: Prove the dependency boundary**

Run:

```powershell
rg -n "fastify|@prisma|node:" packages/shared
```

Expected: no matches.

- [ ] **Step 6: Commit shared contracts**

```powershell
git add packages/shared pnpm-lock.yaml
git commit -m "feat: add framework-neutral shared contracts"
```

### Task 4: Establish the Prisma/PostgreSQL Package

**Spec mapping:** Database Foundation; `packages/database`; Tooling and Commands.

**Files:**

- Create: `packages/database/package.json`
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/prisma.config.ts`
- Create: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260829000000_initialize_foundation/migration.sql`
- Create: `packages/database/prisma/migrations/migration_lock.toml`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/index.ts`
- Create: `packages/database/test/client.test.ts`

**Interfaces:**

- Consumes: `DATABASE_URL` for Prisma CLI/runtime use.
- Produces: `getDatabaseClient(): PrismaClient` and `disconnectDatabase(): Promise<void>`.

- [ ] **Step 1: Write the failing client lifecycle test**

Mock the generated Prisma client and `PrismaPg` adapter boundary. Assert repeated `getDatabaseClient()` calls return the same instance and `disconnectDatabase()` calls `$disconnect` only after initialization.

- [ ] **Step 2: Run the test to verify the red state**

Run:

```powershell
pnpm --filter @takeover/database test
```

Expected: failure because lifecycle exports do not exist.

- [ ] **Step 3: Add minimal schema and migration foundation**

Pin `prisma`, `@prisma/client`, and `@prisma/adapter-pg` to exactly `7.10.0`; add `pg` `8.23.0` and `@types/pg` `8.23.1`. Configure Prisma 7 through `prisma.config.ts`, including schema path, migration path, and `DATABASE_URL`. Use the `prisma-client` generator with an explicit output under `src/generated/prisma`; the schema datasource declares PostgreSQL without a Prisma 6-style `url` field. Define one infrastructure-only `SystemMetadata` model mapped to `system_metadata`, with UUID `id`, unique `key`, string `value`, and timestamps. The migration must enable `pgcrypto` and create only this table/index. Document that it is not a product-domain model.

- [ ] **Step 4: Implement the client lifecycle**

Use one module-scoped generated Prisma client, construct it lazily with `PrismaPg`, and clear it after disconnect. Accept or resolve a PostgreSQL connection string only when constructing the client; do not connect eagerly and do not validate unrelated runtime configuration in this package. Keep the lifecycle test from Step 1 so the adapter migration does not remove behavioral coverage.

- [ ] **Step 5: Generate and validate Prisma**

Run:

```powershell
$env:DATABASE_URL='postgresql://takeover:takeover@localhost:5432/takeover?schema=public'
pnpm db:generate
pnpm db:validate
```

Expected: generation and schema validation exit 0 without requiring a live PostgreSQL server.

- [ ] **Step 6: Verify database package**

Run:

```powershell
pnpm --filter @takeover/database test
pnpm --filter @takeover/database typecheck
pnpm --filter @takeover/database build
```

Expected: all commands exit 0.

- [ ] **Step 7: Prove exclusive Prisma ownership**

Run:

```powershell
rg -n "@prisma/client|schema\.prisma|new PrismaClient" apps packages -g '!packages/database/**'
```

Expected: no matches.

- [ ] **Step 8: Commit database foundation**

```powershell
git add packages/database pnpm-lock.yaml package.json
git commit -m "feat: establish prisma database package"
```

### Task 5: Build the Fastify Runtime with TDD

**Spec mapping:** API Runtime Design; `apps/api`; Error Handling and Security Baseline; Testing Strategy.

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/plugins/health.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/test/env.test.ts`
- Create: `apps/api/test/health.test.ts`

**Interfaces:**

- Consumes: `@takeover/shared` envelopes and `@takeover/database` shutdown lifecycle.
- Produces: `parseApiConfig(env)`, `buildApp(options?)`, `GET /health`, `GET /ready`, and an executable server.

- [ ] **Step 1: Write failing configuration tests**

Test default host/port/log level, numeric port coercion, valid production settings, rejection of invalid environment, port, and log level values, and absence of secret values from thrown messages.

- [ ] **Step 2: Write failing health-route tests**

Use `buildApp({ logger: false })` and `app.inject`. Assert `/health` and `/ready` return HTTP 200, JSON, `data.status`, and a request ID. Assert an unknown path returns the shared error envelope with a stable `NOT_FOUND` code and no stack.

- [ ] **Step 3: Run API tests to verify the red state**

Run:

```powershell
pnpm --filter @takeover/api test
```

Expected: failure because API implementation does not exist.

- [ ] **Step 4: Implement configuration and application construction**

Validate `NODE_ENV`, `API_HOST`, `API_PORT`, and `LOG_LEVEL` with Zod. `buildApp` constructs Fastify, registers the health plugin, installs a shared not-found/error envelope, redacts authorization/cookie credential paths, and never listens.

- [ ] **Step 5: Implement process startup and graceful shutdown**

`server.ts` parses configuration, calls `listen`, logs a structured startup event, and handles `SIGINT`/`SIGTERM` once. Shutdown calls `app.close()` and `disconnectDatabase()` and records failures with a non-zero exit code. It must not connect to PostgreSQL during health-only startup.

- [ ] **Step 6: Verify API package**

Run:

```powershell
pnpm --filter @takeover/api test
pnpm --filter @takeover/api typecheck
pnpm --filter @takeover/api lint
pnpm --filter @takeover/api build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit API foundation**

```powershell
git add apps/api pnpm-lock.yaml
git commit -m "feat: add fastify runtime foundation"
```

### Task 6: Build the Minimal Next.js Application

**Spec mapping:** `apps/web`; Repository Architecture; Testing Strategy.

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`

**Interfaces:**

- Consumes: shared build configuration; no API or database runtime.
- Produces: a minimal standalone-capable Next.js build and development server.

- [ ] **Step 1: Configure the independent web package**

Pin Next.js to `15.5.24`, React and React DOM to `19.2.8`, TypeScript to `5.9.3`, and Tailwind CSS plus `@tailwindcss/postcss` to `4.3.3`. Use `output: 'standalone'`. Provide package-local `dev`, `build`, `start`, `typecheck`, `lint`, and `test` scripts. Add one deterministic site-metadata helper test rather than snapshots or placeholder product behavior; do not add territory fixtures or product UI.

- [ ] **Step 2: Implement the minimal shell**

Create accessible document metadata, a skip link, semantic `main`, and restrained copy identifying TakeOver.com and the gameplay-loop statement. Do not add territory cards, fixtures, navigation flows, forms, or simulated product state.

- [ ] **Step 3: Verify the web package**

Run:

```powershell
pnpm --filter @takeover/web typecheck
pnpm --filter @takeover/web lint
pnpm --filter @takeover/web test
pnpm --filter @takeover/web build
```

Expected: all commands exit 0 and `.next/standalone` exists.

- [ ] **Step 4: Commit web foundation**

```powershell
git add apps/web pnpm-lock.yaml
git commit -m "feat: add minimal next web foundation"
```

### Task 7: Run Workspace Verification and Runtime Smoke Test

**Spec mapping:** Verification and Completion Criteria; Tooling and Commands; Handoff Boundary.

**Files:**

- Create: `scripts/smoke-api.mjs`
- Modify: `docs/PHASES.md`
- Modify: `docs/MEMORY.md`

**Interfaces:**

- Consumes: every Phase 0 deliverable.
- Produces: evidence-backed Phase 0 status and Codex-to-Claude handoff.

- [ ] **Step 1: Run all static and automated checks from a clean command context**

Run:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
$env:DATABASE_URL='postgresql://takeover:takeover@localhost:5432/takeover?schema=public'
pnpm db:validate
```

Expected: every command exits 0.

- [ ] **Step 2: Start the compiled API and probe runtime endpoints**

Create and run `scripts/smoke-api.mjs`. It asks the OS for an unused loopback port, starts `apps/api/dist/server.js` with `API_HOST` and `API_PORT`, polls until healthy, requests `/health`, `/ready`, and an unknown route, verifies the expected envelopes, sends `SIGTERM`, and asserts a clean exit. This cross-platform script replaces shell-specific background-process orchestration.

Run:

```powershell
node scripts/smoke-api.mjs
```

Expected response properties:

```json
{ "data": { "status": "ok" } }
```

and

```json
{ "data": { "status": "ready", "checks": { "application": "ok" } } }
```

Additional envelope fields such as request IDs or timestamps are allowed when documented.

- [ ] **Step 3: Scan for prohibited dependencies and placeholders**

Run:

```powershell
rg -n 'redis|bullmq|stripe|razorpay|next-auth|nodemailer' package.json pnpm-lock.yaml apps packages
Get-ChildItem apps/api/src/modules -ErrorAction SilentlyContinue
rg -n 'FIXME|PLACEHOLDER|mock payment|fake verification|payment succeeded|ownership changed' apps packages docs
```

Expected: no prohibited dependency/import matches; no product-module directory; status/docs references are allowed only when explicitly planned or excluded; no fake success behavior.

- [ ] **Step 4: Inspect repository state and diffs**

Run:

```powershell
git status --short
git diff --check
git log --oneline --decorate -10
```

Expected: no whitespace errors and only intentional documentation status updates remain.

- [ ] **Step 5: Update canonical status and handoff**

Record exact commands and results in `MEMORY.md`; enumerate the workspace; state what Claude can safely change; identify shared-contract coordination; recommend Phase 1 identity design to Codex without starting it. Update only evidence-backed Phase 0 checkboxes/status in `PHASES.md`. Keep PostgreSQL provisioning and migration application unvalidated if no live server was used.

- [ ] **Step 6: Re-run documentation truth checks**

Run:

```powershell
rg -n "IMPLEMENTED NOW|PLANNED|UNVALIDATED / NEEDS REVIEW" docs -g '*.md'
rg -n "complete|implemented|working|connected" docs -g '*.md'
```

Expected: every completion claim is supported by Step 1 or Step 2 evidence; planned product systems remain clearly labeled.

- [ ] **Step 7: Commit verified status**

```powershell
git add docs/PHASES.md docs/MEMORY.md
git commit -m "docs: record verified phase 0 status"
```

- [ ] **Step 8: Confirm clean completion state**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -10
```

Expected: clean `main` branch with coherent Phase 0 commits. Do not begin Phase 1.

## Self-Review Record

- **Spec coverage:** Tasks 1 through 7 map every approved design section to documentation, workspace configuration, shared contracts, database lifecycle, API runtime, web shell, or final verification.
- **Scope:** No task adds product routes, product schema, providers, distributed infrastructure, or empty module scaffolding.
- **Boundary consistency:** `@takeover/shared` is framework-neutral; only `@takeover/database` imports Prisma; applications remain separate packages with independent build/start scripts.
- **Status honesty:** Task 1 creates status-labeled canonical docs before code; Task 7 updates only claims proven by current outputs.
- **Canonical-doc review timing:** Because canonical docs did not exist when this plan was authored, Task 1 requires a plan-to-doc cross-check before Task 2, and Task 7 repeats the truth review after implementation.
- **Type consistency:** Shared exports consumed by API are named explicitly; database lifecycle signatures are stable across Tasks 4 and 5.
- **Verification:** All ten approved acceptance criteria have explicit commands or repository inspections in Task 7.
- **Concurrent-plan reconciliation:** Preserved exact versioning, detailed TDD cases, Prisma 7, and the cross-platform smoke script from the alternate. Rejected Next.js 16, TypeScript 7, Prisma 8 prereleases, permissive peer-dependency settings, docs-after-code ordering, Bash-only verification, and removal of the database lifecycle test.
