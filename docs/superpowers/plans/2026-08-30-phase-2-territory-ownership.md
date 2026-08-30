# Phase 2 Territory + Authoritative Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authoritative territories, non-overlapping ownership history, deterministic reviewed seed data, and public territory/company read APIs without implementing bidding, pricing, payment, or paid capture.

**Architecture:** `@takeover/shared` owns framework-neutral public contracts; `@takeover/database` remains the only Prisma/schema/migration/seed owner; one focused Fastify territory module owns public query mapping and the transaction-bound ownership primitive. `TerritoryOwnership` is the sole ownership truth, public state is derived, and PostgreSQL enforces active-owner and timeline invariants.

**Tech Stack:** Node >=22, pnpm 10.32.1, TypeScript 5.9.3 strict mode, Fastify 5.12.1, Zod 4.5.2, Prisma CLI/client/adapter-pg 7.10.0, PostgreSQL 17 with `btree_gist`, pg 8.23.0, Vitest 3.2.7.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-30-phase-2-territory-ownership-design.md` and the six canonical docs.
- Do not edit or revert concurrent frontend work under `apps/web`; frontend integration is a later Claude handoff.
- Do not add `currentOwnerCompanyId`, `previousOwnerCompanyId`, bid, current-price, or takeover-price fields to `Territory`.
- Do not add `contested` to Prisma, shared contracts, API responses, seed data, or authoritative frontend state.
- Do not add Dodo/Stripe/Razorpay, checkout, payment, webhook, paid-capture orchestration, seasons, battles, leaderboard/empire scoring, activity/SSE, Redis, queues, or workers.
- Do not expose an ownership mutation HTTP route or invent operator authorization.
- `displayWeight` is an integer `1..100`, backend-authoritative, and independent of price, owner, bid volume, company size, or adjacency.
- `TerritoryOwnership` is the sole ownership source of truth. Public `unclaimed`, `claimed`, and `disabled` state is derived.
- Suspended companies remain truthfully named in current/history projections with `status: 'suspended'`.
- Bigint versions are decimal strings over JSON.
- Phase 1 `territoryExternalRef`, `quoteAuthority: 'reference_only'`, and `checkoutAvailable: false` remain backward compatible.
- Use TDD for behavior changes and PostgreSQL integration tests for migration, constraint, transaction, and concurrency behavior.
- Commit after each accepted task. Update canonical docs only with verified implementation evidence.
- **Seed review gate:** do not create `packages/database/src/territory-seed-data.ts` or execute a production seed until the exact proposal below is explicitly approved.
- At implementation start, record `git rev-parse HEAD` and `git status --short`; use that snapshot to prove Codex did not overwrite concurrent `apps/web` work.

---

## Planned File Map

### Shared package

- Create `packages/shared/src/territory.ts` — public Zod schemas, inferred types, query/pagination contracts, bigint-string validation.
- Create `packages/shared/test/territory.test.ts` — contract acceptance/rejection and Phase 1 compatibility tests.
- Modify `packages/shared/src/constants.ts` — territory availability/public status and ownership-source constants only.
- Modify `packages/shared/src/index.ts` — exact Phase 2 exports.
- Modify `packages/shared/src/api.ts` — stable territory error codes.

### Database package

- Modify `packages/database/prisma/schema.prisma` — category, territory, ownership, and nullable intent relation.
- Create `packages/database/prisma/migrations/20260830000000_add_territory_ownership/migration.sql` — generated base migration plus reviewed PostgreSQL constraints, extension, exclusion, and immutability trigger.
- Modify `packages/database/package.json` — seed/check scripts and the shared-package dependency required for canonical validation.
- Create `packages/database/src/territory-seed.ts` — validate, preflight collisions, transact idempotent category/territory upserts.
- Create `packages/database/src/territory-seed-cli.ts` — safe executable entry point using `DATABASE_URL`.
- Create `packages/database/src/territory-seed-data.ts` — exact approved table below; blocked until seed review approval.
- Create `packages/database/test/territory-seed.test.ts` — validation and pure preflight tests.
- Create `packages/database/test/integration/territory-seed-postgres.test.ts` only if database-package integration config is introduced; otherwise keep live seed assertions in the API integration suite to avoid duplicate harnesses.

### API application

- Create `apps/api/src/modules/territories/domain.ts` — derived status, cursor value types, public projection guards, ownership errors.
- Create `apps/api/src/modules/territories/repository.ts` — query and transaction-bound ownership interfaces.
- Create `apps/api/src/modules/territories/prisma-repository.ts` — public reads, cursor ordering, row locks, compare-and-swap ownership replacement.
- Create `apps/api/src/modules/territories/service.ts` — response mapping, visibility rules, pagination, five-entry preview.
- Create `apps/api/src/modules/territories/routes.ts` — six thin public read routes.
- Create `apps/api/src/plugins/territories.ts` — focused module registration.
- Modify `apps/api/src/app.ts` — wire the module only when a database client exists; allow service injection in HTTP tests.
- Create `apps/api/test/territory-domain.test.ts` — pure status/projection/cursor behavior.
- Create `apps/api/test/territory-service.test.ts` — query and privacy mapping behavior.
- Create `apps/api/test/territory-http.test.ts` — public envelope, validation, filter, pagination, and route tests.
- Create `apps/api/test/integration/territory-postgres.test.ts` — real queries, constraints, intent compatibility, and seed behavior.
- Create `apps/api/test/integration/territory-ownership-concurrency.test.ts` — row-lock/version races and rollback.
- Modify existing integration reset helpers so territory tables truncate before companies without weakening Phase 1 tests.

### Documentation

- Modify `docs/ARCHITECTURE.md`, `docs/PHASES.md`, and `docs/MEMORY.md` only after implementation evidence exists.
- Modify `docs/PRD.md` or `docs/DESIGN.md` only if implementation reveals an approved requirement change; do not rewrite them as an activity log.

## Task Order and Dependencies

| Task | Deliverable                           | Depends on                                 |
| ---: | ------------------------------------- | ------------------------------------------ |
|    1 | Shared contracts                      | Approved design                            |
|    2 | Prisma schema and migration           | Task 1 names locked                        |
|    3 | Deterministic seed                    | Tasks 1–2 and explicit seed-table approval |
|    4 | Pure domain/projection rules          | Task 1                                     |
|    5 | Public query repository/service       | Tasks 2 and 4                              |
|    6 | Transaction-bound ownership primitive | Tasks 2 and 4                              |
|    7 | Public Fastify APIs                   | Task 5                                     |
|    8 | PostgreSQL API response proof         | Tasks 3 and 7                              |
|    9 | Phase 1 intent compatibility          | Task 2                                     |
|   10 | Constraint/concurrency hardening      | Tasks 6 and 8                              |
|   11 | Complete verification                 | Tasks 1–10                                 |
|   12 | Verified docs and Claude handoff      | Task 11                                    |

---

## Exact Seed Proposal — Product Review Gate

All proposed territories are `ACTIVE` and unclaimed. `accentColor` is an internally selected decorative territory/category accent, not an owner color or state signal. No image URL is proposed. Stable public UUIDs are intentionally non-secret.

### Categories

| UUID                                   | Slug              | Name            | Display order | Description                                                   |
| -------------------------------------- | ----------------- | --------------- | ------------: | ------------------------------------------------------------- |
| `20000000-0000-4000-8000-000000000001` | `ai`              | AI              |            10 | Products building with or delivering artificial intelligence. |
| `20000000-0000-4000-8000-000000000002` | `developer-tools` | Developer Tools |            20 | Tools used to build, test, ship, and maintain software.       |
| `20000000-0000-4000-8000-000000000003` | `design`          | Design          |            30 | Products for interface, product, and creative design work.    |
| `20000000-0000-4000-8000-000000000004` | `productivity`    | Productivity    |            40 | Tools that organize work and help teams move faster.          |
| `20000000-0000-4000-8000-000000000005` | `infrastructure`  | Infrastructure  |            50 | Platforms that run, store, and observe production systems.    |
| `20000000-0000-4000-8000-000000000006` | `marketing`       | Marketing       |            60 | Products for discovery, audience growth, and communication.   |
| `20000000-0000-4000-8000-000000000007` | `commerce`        | Commerce        |            70 | Products that enable online transactions and storefronts.     |
| `20000000-0000-4000-8000-000000000008` | `data`            | Data            |            80 | Products for measuring, moving, and understanding data.       |

### Territories

| UUID                                   | Slug                   | Name                 | Description                                                               | Category        | Weight | Availability | iconKey                  | accentColor |
| -------------------------------------- | ---------------------- | -------------------- | ------------------------------------------------------------------------- | --------------- | -----: | ------------ | ------------------------ | ----------- |
| `21000000-0000-4000-8000-000000000001` | `ai-coding`            | AI Coding            | AI-assisted software creation, review, and developer workflows.           | AI              |    100 | `ACTIVE`     | `code-2`                 | `#A78BFA`   |
| `21000000-0000-4000-8000-000000000002` | `ai-image-generation`  | AI Image Generation  | Generative tools for creating and editing visual imagery.                 | AI              |     90 | `ACTIVE`     | `image`                  | `#A78BFA`   |
| `21000000-0000-4000-8000-000000000003` | `ai-video`             | AI Video             | AI-native video generation, editing, and production.                      | AI              |     85 | `ACTIVE`     | `video`                  | `#A78BFA`   |
| `21000000-0000-4000-8000-000000000004` | `ai-search`            | AI Search            | Search and answer experiences powered by artificial intelligence.         | AI              |     80 | `ACTIVE`     | `search`                 | `#A78BFA`   |
| `21000000-0000-4000-8000-000000000005` | `ai-agents`            | AI Agents            | Autonomous and assisted agents that execute multi-step work.              | AI              |     95 | `ACTIVE`     | `bot`                    | `#A78BFA`   |
| `21000000-0000-4000-8000-000000000006` | `ides`                 | IDEs                 | Environments for writing, navigating, and debugging software.             | Developer Tools |     75 | `ACTIVE`     | `panels-top-left`        | `#22D3EE`   |
| `21000000-0000-4000-8000-000000000007` | `api-tools`            | API Tools            | Products for designing, testing, documenting, and operating APIs.         | Developer Tools |     65 | `ACTIVE`     | `plug`                   | `#22D3EE`   |
| `21000000-0000-4000-8000-000000000008` | `testing`              | Testing              | Tools for automated software quality and test execution.                  | Developer Tools |     55 | `ACTIVE`     | `flask-conical`          | `#22D3EE`   |
| `21000000-0000-4000-8000-000000000009` | `ci-cd`                | CI/CD                | Continuous integration, delivery, and deployment tooling.                 | Developer Tools |     60 | `ACTIVE`     | `workflow`               | `#22D3EE`   |
| `21000000-0000-4000-8000-000000000010` | `ui-design`            | UI Design            | Tools for designing interfaces and reusable visual systems.               | Design          |     70 | `ACTIVE`     | `pen-tool`               | `#F472B6`   |
| `21000000-0000-4000-8000-000000000011` | `prototyping`          | Prototyping          | Products for turning concepts into interactive product prototypes.        | Design          |     55 | `ACTIVE`     | `frame`                  | `#F472B6`   |
| `21000000-0000-4000-8000-000000000012` | `creative-tools`       | Creative Tools       | Software for digital illustration, media, and creative production.        | Design          |     60 | `ACTIVE`     | `palette`                | `#F472B6`   |
| `21000000-0000-4000-8000-000000000013` | `notes`                | Notes                | Products for capturing, organizing, and retrieving knowledge.             | Productivity    |     55 | `ACTIVE`     | `notebook`               | `#FBBF24`   |
| `21000000-0000-4000-8000-000000000014` | `project-management`   | Project Management   | Tools for planning, coordinating, and tracking team delivery.             | Productivity    |     70 | `ACTIVE`     | `kanban`                 | `#FBBF24`   |
| `21000000-0000-4000-8000-000000000015` | `automation`           | Automation           | Products that connect systems and automate repeatable work.               | Productivity    |     75 | `ACTIVE`     | `zap`                    | `#FBBF24`   |
| `21000000-0000-4000-8000-000000000016` | `hosting`              | Hosting              | Platforms for deploying and serving applications and websites.            | Infrastructure  |     75 | `ACTIVE`     | `server`                 | `#60A5FA`   |
| `21000000-0000-4000-8000-000000000017` | `databases`            | Databases            | Systems for durable application data storage and retrieval.               | Infrastructure  |     80 | `ACTIVE`     | `database`               | `#60A5FA`   |
| `21000000-0000-4000-8000-000000000018` | `observability`        | Observability        | Tools for understanding system health, behavior, and failures.            | Infrastructure  |     60 | `ACTIVE`     | `activity`               | `#60A5FA`   |
| `21000000-0000-4000-8000-000000000019` | `cloud-infrastructure` | Cloud Infrastructure | Programmable compute, networking, and foundational cloud services.        | Infrastructure  |     85 | `ACTIVE`     | `cloud`                  | `#60A5FA`   |
| `21000000-0000-4000-8000-000000000020` | `seo`                  | SEO                  | Products for improving visibility in organic search.                      | Marketing       |     65 | `ACTIVE`     | `search-check`           | `#FB7185`   |
| `21000000-0000-4000-8000-000000000021` | `email-marketing`      | Email Marketing      | Tools for audience email campaigns, lifecycle messaging, and measurement. | Marketing       |     55 | `ACTIVE`     | `mail`                   | `#FB7185`   |
| `21000000-0000-4000-8000-000000000022` | `social-media`         | Social Media         | Products for publishing, managing, and measuring social channels.         | Marketing       |     70 | `ACTIVE`     | `megaphone`              | `#FB7185`   |
| `21000000-0000-4000-8000-000000000023` | `payments`             | Payments             | Infrastructure and products for accepting and moving money online.        | Commerce        |     80 | `ACTIVE`     | `credit-card`            | `#34D399`   |
| `21000000-0000-4000-8000-000000000024` | `e-commerce`           | E-commerce           | Platforms for building and operating online storefronts.                  | Commerce        |     75 | `ACTIVE`     | `shopping-cart`          | `#34D399`   |
| `21000000-0000-4000-8000-000000000025` | `analytics`            | Analytics            | Products for measuring behavior, performance, and outcomes.               | Data            |     70 | `ACTIVE`     | `chart-no-axes-combined` | `#818CF8`   |
| `21000000-0000-4000-8000-000000000026` | `data-infrastructure`  | Data Infrastructure  | Systems for collecting, transforming, and serving data at scale.          | Data            |     65 | `ACTIVE`     | `warehouse`              | `#818CF8`   |
| `21000000-0000-4000-8000-000000000027` | `data-visualization`   | Data Visualization   | Tools that turn complex data into understandable visual stories.          | Data            |     55 | `ACTIVE`     | `chart-scatter`          | `#818CF8`   |

**Review consequence:** approval of this plan must explicitly include approval or requested edits for this table. Task 3 must stop if seed approval is not explicit.

---

### Task 1: Publish Framework-Neutral Phase 2 Contracts

**Spec mapping:** shared contracts; public response shapes; decimal bigint versions; `displayWeight`; no duplicated Phase 1 company aggregate.

**Files:**

- Create: `packages/shared/src/territory.ts`
- Create: `packages/shared/test/territory.test.ts`
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/api.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**

- Consumes: existing `verificationLevelSchema`, `httpsUrlSchema`, API envelope helpers.
- Produces: `TerritoryCategory`, `TerritoryVisualMetadata`, `CompanyPublicSummary`, `TerritoryOwnershipSummary`, `TerritorySummary`, `TerritoryDetail`, `TerritoryHistoryEntry`, `CompanyTerritories`, `TerritoryPage`, `TerritoryHistoryPage`, `TerritoryListQuery`, `PaginationQuery`, `PageMeta`, their Zod schemas, `TERRITORY_PUBLIC_STATUSES`, `TERRITORY_AVAILABILITY_STATUSES`, `OWNERSHIP_SOURCES`.

- [ ] **Step 1: Write failing shared-contract tests**

Cover a claimed territory with suspended owner, previous-owner logo, five-entry-compatible history arrays, decimal versions, category/status filters, and cursor metadata. Reject `displayWeight` 0/101/fractional, numeric bigint versions, unknown visual keys, malformed colors/URLs/slugs, `contested`, `controlled_correction`, private `contactEmail`, and non-ISO dates.

```ts
expect(
  territorySummarySchema.parse({
    id: territoryId,
    slug: 'ai-coding',
    name: 'AI Coding',
    description: 'AI-assisted software creation.',
    category,
    displayWeight: 100,
    status: 'claimed',
    visualMetadata: { iconKey: 'code-2', accentColor: '#A78BFA' },
    version: '2',
    currentOwnership: {
      id: ownershipId,
      owner: { ...company, status: 'suspended' },
      capturedAt: '2026-08-30T00:00:00.000Z',
      territoryVersion: '2',
      source: 'paid_capture',
    },
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }),
).toMatchObject({ displayWeight: 100, status: 'claimed', version: '2' });
expect(() => territoryStatusSchema.parse('contested')).toThrow();
expect(() => ownershipSourceSchema.parse('controlled_correction')).toThrow();
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --filter @takeover/shared test -- territory.test.ts`

Expected: FAIL because Phase 2 exports do not exist.

- [ ] **Step 3: Implement the minimal contracts**

Use strict Zod objects, `z.uuid()`, lowercase kebab-case slugs, ISO offset timestamps, `z.coerce.number()` only for query `limit`, and this version schema:

```ts
export const territoryVersionSchema = z.string().regex(/^[1-9][0-9]*$/);
export const displayWeightSchema = z.number().int().min(1).max(100);
export const territoryStatusSchema = z.enum(['unclaimed', 'claimed', 'disabled']);
export const ownershipSourceSchema = z.enum(['initial_seed', 'paid_capture']);
```

Keep `CompanyPublicSummary` explicitly named as a public projection and reuse `verificationLevelSchema`; do not alter Phase 1 `companySchema`.

- [ ] **Step 4: Export stable error codes**

Add `TERRITORY_NOT_FOUND`, `TERRITORY_CATEGORY_NOT_FOUND`, `INVALID_CURSOR`, `STALE_TERRITORY_VERSION`, `TERRITORY_DISABLED`, `OWNERSHIP_CONFLICT`, and `OWNERSHIP_HISTORY_INVALID` to `ERROR_CODES`.

- [ ] **Step 5: Run focused and package checks**

Run:

```powershell
pnpm --filter @takeover/shared test
pnpm --filter @takeover/shared typecheck
pnpm --filter @takeover/shared lint
```

Expected: all shared tests pass; no Fastify, Prisma, Node-only, payment, season, battle, leaderboard, or activity import exists.

- [ ] **Step 6: Add immediate Claude handoff and commit**

Update `docs/MEMORY.md` with the exact exports now safe to consume, labeled contracts-only until APIs are implemented.

```powershell
git add packages/shared docs/MEMORY.md
git commit -m "feat(shared): publish territory ownership contracts"
```

### Task 2: Add Prisma Territory and Ownership Schema

**Spec mapping:** schema; single ownership truth; intent nullable relationship; approved ownership sources; PostgreSQL extension and constraints.

**Files:**

- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/20260830000000_add_territory_ownership/migration.sql`
- Test: `apps/api/test/integration/territory-postgres.test.ts`

**Interfaces:**

- Consumes: Phase 1 `Company` and `TakeoverIntent`.
- Produces: Prisma `TerritoryCategory`, `Territory`, `TerritoryOwnership`; nullable `TakeoverIntent.territoryId`; enums `TerritoryAvailabilityStatus` and `TerritoryOwnershipSource`.

- [ ] **Step 1: Write a failing PostgreSQL migration/invariant test**

Assert generated client models do not yet exist, then describe live expectations: duplicate slugs fail, weights outside 1–100 fail, active ownership duplicates fail, overlaps fail, and external intent references remain unchanged/null-linked.

- [ ] **Step 2: Run database generation/integration test and confirm RED**

Run:

```powershell
$env:DATABASE_URL=$env:TEST_DATABASE_URL
pnpm db:generate
pnpm --filter @takeover/api test:integration -- territory-postgres.test.ts
```

Expected: FAIL because models/migration are absent.

- [ ] **Step 3: Add the Prisma models and relations**

Use these exact model-level semantics:

```prisma
enum TerritoryAvailabilityStatus { ACTIVE DISABLED }
enum TerritoryOwnershipSource { INITIAL_SEED PAID_CAPTURE }

model TerritoryCategory {
  id String @id @default(uuid()) @db.Uuid
  slug String @unique @db.VarChar(100)
  name String @db.VarChar(100)
  description String? @db.VarChar(500)
  displayOrder Int @map("display_order")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
  territories Territory[]
  @@map("territory_categories")
}

model Territory {
  id String @id @default(uuid()) @db.Uuid
  slug String @unique @db.VarChar(120)
  name String @db.VarChar(120)
  description String @db.VarChar(1000)
  categoryId String @map("category_id") @db.Uuid
  displayWeight Int @map("display_weight")
  availabilityStatus TerritoryAvailabilityStatus @default(ACTIVE) @map("availability_status")
  visualMetadata Json @default("{}") @map("visual_metadata")
  version BigInt @default(1)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
  category TerritoryCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  ownershipHistory TerritoryOwnership[]
  takeoverIntents TakeoverIntent[]
  @@index([categoryId, displayWeight, name, id])
  @@map("territories")
}

model TerritoryOwnership {
  id String @id @default(uuid()) @db.Uuid
  territoryId String @map("territory_id") @db.Uuid
  companyId String @map("company_id") @db.Uuid
  capturedAt DateTime @map("captured_at") @db.Timestamptz(3)
  endedAt DateTime? @map("ended_at") @db.Timestamptz(3)
  source TerritoryOwnershipSource
  reason String? @db.VarChar(500)
  territoryVersion BigInt @map("territory_version")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  territory Territory @relation(fields: [territoryId], references: [id], onDelete: Restrict)
  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)
  @@unique([territoryId, territoryVersion])
  @@index([companyId, endedAt])
  @@index([territoryId, capturedAt])
  @@map("territory_ownerships")
}
```

Add `territoryId String? @db.Uuid`, relation, and index to `TakeoverIntent`; retain `territoryExternalRef` unchanged.

- [ ] **Step 4: Generate the base migration, then review and add mandatory SQL**

The committed migration must include:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE UNIQUE INDEX "territory_ownerships_one_active_per_territory"
  ON "territory_ownerships" ("territory_id") WHERE "ended_at" IS NULL;
ALTER TABLE "territory_categories" ADD CONSTRAINT "territory_categories_slug_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "territory_categories" ADD CONSTRAINT "territory_categories_display_order_check"
  CHECK ("display_order" >= 0);
ALTER TABLE "territories" ADD CONSTRAINT "territories_slug_check"
  CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "territories" ADD CONSTRAINT "territories_display_weight_check"
  CHECK ("display_weight" BETWEEN 1 AND 100);
ALTER TABLE "territories" ADD CONSTRAINT "territories_version_check" CHECK ("version" > 0);
ALTER TABLE "territories" ADD CONSTRAINT "territories_visual_metadata_object_check"
  CHECK (jsonb_typeof("visual_metadata") = 'object');
ALTER TABLE "territory_ownerships" ADD CONSTRAINT "territory_ownerships_reign_check"
  CHECK ("ended_at" IS NULL OR "ended_at" > "captured_at");
ALTER TABLE "territory_ownerships" ADD CONSTRAINT "territory_ownerships_version_check"
  CHECK ("territory_version" > 0);
ALTER TABLE "territory_ownerships" ADD CONSTRAINT "territory_ownerships_no_overlap"
  EXCLUDE USING gist (
    "territory_id" WITH =,
    tstzrange("captured_at", "ended_at", '[)') WITH &&
  );
```

Add database slug/display-order checks and a trigger function that rejects changes to ownership ID, territory, company, capture timestamp, source, reason, version, or creation timestamp; it permits only one `ended_at` transition from null to a valid timestamp. Never use `DROP EXTENSION` in rollback guidance because the extension may be shared.

The trigger must follow this behavior rather than silently accepting direct rewrites:

```sql
CREATE FUNCTION "protect_territory_ownership_history"() RETURNS trigger AS $$
BEGIN
  IF NEW."id" <> OLD."id"
    OR NEW."territory_id" <> OLD."territory_id"
    OR NEW."company_id" <> OLD."company_id"
    OR NEW."captured_at" <> OLD."captured_at"
    OR NEW."source" <> OLD."source"
    OR NEW."reason" IS DISTINCT FROM OLD."reason"
    OR NEW."territory_version" <> OLD."territory_version"
    OR NEW."created_at" <> OLD."created_at" THEN
    RAISE EXCEPTION 'territory ownership history is immutable';
  END IF;
  IF OLD."ended_at" IS NOT NULL
    OR NEW."ended_at" IS NULL
    OR NEW."ended_at" <= OLD."captured_at" THEN
    RAISE EXCEPTION 'invalid territory ownership end transition';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "territory_ownership_history_immutable"
BEFORE UPDATE ON "territory_ownerships"
FOR EACH ROW EXECUTE FUNCTION "protect_territory_ownership_history"();
```

- [ ] **Step 5: Validate, generate, reset, and run live migration tests**

Run:

```powershell
$env:DATABASE_URL=$env:TEST_DATABASE_URL
pnpm db:validate
pnpm db:generate
$env:TAKEOVER_ALLOW_TEST_DATABASE_RESET='true'
pnpm db:test:prepare
pnpm --filter @takeover/api test:integration -- territory-postgres.test.ts
```

Expected: extension exists on PostgreSQL 17; all three migrations apply; constraints reject invalid rows; Phase 1 external references survive.

- [ ] **Step 6: Commit**

```powershell
git add packages/database/prisma apps/api/test/integration/territory-postgres.test.ts
git commit -m "feat(database): add authoritative territory ownership schema"
```

### Task 3: Add Deterministic Seed Infrastructure and Approved Seed Data

**Spec mapping:** small reviewed seed; no admin UI; no fictional ownership; exact IDs/data; idempotency.

**Review gate:** stop before this task unless the user explicitly approves the exact seed table in this plan.

**Files:**

- Modify: `packages/database/package.json`
- Create: `packages/database/src/territory-seed.ts`
- Create after approval: `packages/database/src/territory-seed-data.ts`
- Create: `packages/database/src/territory-seed-cli.ts`
- Create: `packages/database/test/territory-seed.test.ts`
- Modify: `packages/database/src/index.ts` only for reusable seed service exports; do not export raw production seed data to browser consumers.

**Interfaces:**

- Consumes: approved table, `territoryVisualMetadataSchema`, `displayWeightSchema`, Prisma transaction client.
- Produces: `validateTerritorySeed`, `applyTerritorySeed`, `TerritorySeedDefinition`, CLI `db:seed:territories`.

- [ ] **Step 1: Confirm the exact seed table is approved**

Expected evidence: explicit user approval or requested edits committed into this plan. If absent, mark Task 3 blocked and do not create seed data.

- [ ] **Step 2: Write failing pure seed tests**

Assert 8 unique category IDs/slugs, 27 unique territory IDs/slugs, weights/colors/icons valid, every category referenced, every category non-empty, all availability active, and no company/ownership/payment/activity fields. Assert duplicate ID/slug and conflicting existing slug errors are deterministic.

- [ ] **Step 3: Run focused test and confirm RED**

Run: `pnpm --filter @takeover/database test -- territory-seed.test.ts`

Expected: FAIL because seed validation does not exist.

- [ ] **Step 4: Implement validation and transactional upserts**

`applyTerritorySeed(prisma, definition)` must validate the complete definition before opening a transaction, preflight stable-ID/slug collisions, upsert categories before territories, never delete absent rows, never create ownership/company/contact/audit rows, and produce `{ categoriesCreatedOrUpdated, territoriesCreatedOrUpdated }`.

Use one transaction and stable IDs. Re-running the exact input must leave row counts and semantic values unchanged.

Add `"@takeover/shared": "workspace:*"` to database dependencies and match the API package's workspace-dependency build pattern so direct database build/typecheck/test commands compile the canonical shared schemas first. Do not copy visual/weight validation into a second package-local definition.

- [ ] **Step 5: Add the exact approved seed data and CLI**

The CLI obtains the client only through `@takeover/database`, applies the seed, emits counts without secrets, and always disconnects in `finally`. Add:

```json
"db:seed:territories": "pnpm build && node dist/territory-seed-cli.js"
```

- [ ] **Step 6: Prove seed idempotency against PostgreSQL**

Run the seed twice, assert 8 categories, 27 territories, zero ownership rows, unchanged IDs/slugs/versions, and no duplicate rows.

- [ ] **Step 7: Commit**

```powershell
git add packages/database
git commit -m "feat(database): add deterministic territory seed"
```

### Task 4: Implement Pure Territory Domain and Public Projection Rules

**Spec mapping:** derived status; suspended-owner truth; privacy allow-list; five-entry preview; decimal versions.

**Files:**

- Create: `apps/api/src/modules/territories/domain.ts`
- Create: `apps/api/test/territory-domain.test.ts`

**Interfaces:**

- Consumes: shared territory types.
- Produces: `deriveTerritoryStatus`, `assertPublicCompany`, `serializeTerritoryVersion`, `TERRITORY_HISTORY_PREVIEW_LIMIT = 5`, `TerritoryDataIntegrityError`, `StaleTerritoryVersionError`, `TerritoryDisabledError`, `OwnershipConflictError`.

- [ ] **Step 1: Write failing deterministic tests**

Test active/no owner -> unclaimed; active/owner -> claimed; disabled with/without owner -> disabled; suspended/archived owner remains named; draft owner throws integrity error; bigint serializes to decimal; preview limit equals five; no contested branch exists.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --filter @takeover/api test -- territory-domain.test.ts`

- [ ] **Step 3: Implement minimal pure functions**

```ts
export const TERRITORY_HISTORY_PREVIEW_LIMIT = 5;

export function deriveTerritoryStatus(
  availability: 'ACTIVE' | 'DISABLED',
  hasActiveOwnership: boolean,
): 'unclaimed' | 'claimed' | 'disabled' {
  if (availability === 'DISABLED') return 'disabled';
  return hasActiveOwnership ? 'claimed' : 'unclaimed';
}

export function serializeTerritoryVersion(version: bigint): string {
  if (version <= 0n) throw new TerritoryDataIntegrityError('Invalid territory version');
  return version.toString(10);
}
```

Public company mapping must construct an allow-listed object and collect only currently `VERIFIED` verification levels; never spread a Prisma record.

- [ ] **Step 4: Run test/typecheck/lint and commit**

```powershell
pnpm --filter @takeover/api test -- territory-domain.test.ts
pnpm --filter @takeover/api typecheck
pnpm --filter @takeover/api lint
git add apps/api/src/modules/territories/domain.ts apps/api/test/territory-domain.test.ts
git commit -m "feat(api): add territory domain projection rules"
```

### Task 5: Add Territory Query Repository and Cursor Semantics

**Spec mapping:** public list/detail/history/company reads; deterministic ordering; one source of ownership truth; privacy.

**Files:**

- Create: `apps/api/src/modules/territories/repository.ts`
- Create: `apps/api/src/modules/territories/prisma-repository.ts`
- Create: `apps/api/test/territory-service.test.ts`
- Create: `apps/api/src/modules/territories/service.ts`

**Interfaces:**

- Produces:

```ts
interface TerritoryRepository {
  listCategories(): Promise<CategoryRecord[]>;
  listTerritories(query: TerritoryListQueryRecord): Promise<CursorPage<TerritoryRecord>>;
  findTerritoryBySlug(slug: string, historyLimit: number): Promise<TerritoryRecord | null>;
  listTerritoryHistory(
    territoryId: string,
    page: CursorQuery,
  ): Promise<CursorPage<OwnershipRecord>>;
  findPublicCompanyBySlug(slug: string): Promise<PublicCompanyRecord | null>;
  listCompanyTerritories(
    companyId: string,
    page: CursorQuery,
  ): Promise<CursorPage<TerritoryRecord>>;
  countCompanyTerritories(companyId: string): Promise<number>;
}
```

- [ ] **Step 1: Write failing service tests with a fake repository**

Cover ordering parameters, category/status filters, invalid cursor, not found, five-entry detail preview, current/previous owner mapping, suspended owner, disabled holdings included, draft-owner integrity failure, verified-level filtering, no private fields, and `currentTerritoryCount` derived only for the company-territories response.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --filter @takeover/api test -- territory-service.test.ts`

- [ ] **Step 3: Implement cursor and query services**

Use an opaque base64url cursor with a versioned internal JSON payload. Territory list payload contains `displayWeight`, `name`, and `id`; history contains `capturedAt` and `id`; company holdings use territory ordering. Decode with strict Zod validation and return `INVALID_CURSOR` on malformed/version-mismatched payloads.

Territory ordering is `displayWeight DESC, name ASC, id ASC`. History ordering is `capturedAt DESC, id DESC`. Query `limit + 1`, drop the sentinel row, and encode the final returned record as `nextCursor`.

- [ ] **Step 4: Implement Prisma public reads**

Load active ownership and the immediately previous reign from `TerritoryOwnership`; never read a summary owner column. Select only public company columns plus verified verification levels. Apply public status filtering with `EXISTS`/`NOT EXISTS` ownership predicates and availability priority.

- [ ] **Step 5: Run unit checks and commit**

```powershell
pnpm --filter @takeover/api test -- territory-service.test.ts
pnpm --filter @takeover/api typecheck
pnpm --filter @takeover/api lint
git add apps/api/src/modules/territories apps/api/test/territory-service.test.ts
git commit -m "feat(api): add territory public query layer"
```

### Task 6: Add the Transaction-Bound Ownership Primitive

**Spec mapping:** safe concurrent transitions; stale version; no HTTP mutation; no payment assertions.

**Files:**

- Modify: `apps/api/src/modules/territories/repository.ts`
- Modify: `apps/api/src/modules/territories/prisma-repository.ts`
- Create: `apps/api/test/integration/territory-ownership-concurrency.test.ts`

**Interfaces:**

```ts
type ReplaceActiveOwnershipInput = {
  territoryId: string;
  newOwnerCompanyId: string;
  expectedTerritoryVersion: bigint;
  transitionAt: Date;
  source: 'INITIAL_SEED' | 'PAID_CAPTURE';
  reason?: string;
};

type ReplaceActiveOwnershipResult = {
  territoryId: string;
  previousOwnershipId: string | null;
  ownershipId: string;
  territoryVersion: bigint;
};
```

The method must be available only on a repository constructed with a supplied Prisma transaction client. It cannot call `$transaction` itself.

- [ ] **Step 1: Write failing live transaction tests**

Cover first owner; owner replacement at one timestamp; same-owner rejection; disabled rejection; stale expected version rollback; old reign ending once; no mutation of immutable history; callback rollback; two concurrent replacements where exactly one wins; no audit/payment/activity side effects.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --filter @takeover/api test:integration -- territory-ownership-concurrency.test.ts`

- [ ] **Step 3: Implement row lock and compare-and-swap**

Within the caller transaction:

1. `SELECT ... FROM territories WHERE id = $1 FOR UPDATE`.
2. Reject missing/disabled/stale territory.
3. Load the active ownership and reject the same company.
4. Set old `endedAt = transitionAt` when present.
5. Increment territory version with `WHERE id = ? AND version = expected` and require one row.
6. Insert the new ownership with the incremented version and same transition timestamp.
7. Return IDs/version; let database constraints surface as stable domain errors.

Do not validate a payment, bid, contact, session, or quote inside this primitive.

- [ ] **Step 4: Run the concurrency suite repeatedly**

```powershell
1..5 | ForEach-Object { pnpm --filter @takeover/api test:integration -- territory-ownership-concurrency.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Expected: exactly one concurrent replacement succeeds every run; history has no gaps/overlaps.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/territories apps/api/test/integration/territory-ownership-concurrency.test.ts
git commit -m "feat(api): add atomic territory ownership primitive"
```

### Task 7: Expose Public Read-Only Territory APIs

**Spec mapping:** approved endpoints; thin Fastify routes; stable envelopes; no write route.

**Files:**

- Create: `apps/api/src/modules/territories/routes.ts`
- Create: `apps/api/src/plugins/territories.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/territory-http.test.ts`

**Interfaces:**

- Consumes: `TerritoryService` from Task 5 and shared query schemas from Task 1.
- Produces exactly six GET routes; no POST/PUT/PATCH/DELETE territory route.

- [ ] **Step 1: Write failing Fastify injection tests**

Assert each approved route, `{ data, meta: { requestId, ...page } }`, filters, default/max limit, not-found and invalid-cursor errors, disabled readability, five-entry detail preview, suspended-owner status, and absence of `currentBid`, `takeoverPrice`, `minimumTakeover`, `checkout`, contact, grant, or session keys.

- [ ] **Step 2: Run and confirm RED**

Run: `pnpm --filter @takeover/api test -- territory-http.test.ts`

- [ ] **Step 3: Implement thin routes and dependency injection**

Register:

```text
GET /api/territory-categories
GET /api/territories
GET /api/territories/:slug
GET /api/territories/:slug/history
GET /api/companies/:slug
GET /api/companies/:slug/territories
```

Routes parse shared query/param schemas, call one service method, and send the standard envelope. Wire injected service for tests and Prisma repository when runtime database configuration exists.

- [ ] **Step 4: Run API unit/HTTP checks and commit**

```powershell
pnpm --filter @takeover/api test
pnpm --filter @takeover/api typecheck
pnpm --filter @takeover/api lint
git add apps/api/src apps/api/test/territory-http.test.ts
git commit -m "feat(api): expose public territory read APIs"
```

### Task 8: Verify Public API Response Shapes Against PostgreSQL

**Spec mapping:** real ownership/history/public company projection and list behavior.

**Files:**

- Expand: `apps/api/test/integration/territory-postgres.test.ts`
- Modify: integration reset helper(s) only as necessary.

**Interfaces:** consumes real Fastify app, Prisma repository, and seeded fixture rows.

- [ ] **Step 1: Add failing live API assertions**

Create test-only active, suspended, and archived companies plus controlled ownership rows. Verify list/detail/history/company endpoints; current and previous owner logo; five-entry preview; full cursor history; disabled current holding; public verification levels; current territory count; no draft/private data.

- [ ] **Step 2: Run and confirm any mapping/query failures**

Run: `pnpm --filter @takeover/api test:integration -- territory-postgres.test.ts`

- [ ] **Step 3: Make only minimal query/mapping corrections**

Do not add denormalized summary fields or caching. Treat multiple active owners/draft owner as integrity failures even though database constraints should prevent the former.

- [ ] **Step 4: Run Phase 1 + Phase 2 live integration suite and commit**

```powershell
pnpm --filter @takeover/api test:integration
git add apps/api/src/modules/territories apps/api/test/integration
git commit -m "test(api): verify territory reads against postgres"
```

### Task 9: Preserve Phase 1 TakeoverIntent Semantics

**Spec mapping:** nullable relationship; retain external ref; no ambiguous rewrite; no checkout/quote-authority change.

**Files:**

- Modify tests: `packages/shared/test/company-claim.test.ts`
- Modify tests: `apps/api/test/company-identity-service.test.ts`
- Modify tests: `apps/api/test/integration/company-identity-postgres.test.ts`
- Modify `apps/api/src/modules/company-identity/prisma-repository.ts` only if generated relation changes require explicit field preservation.

**Interfaces:** `TakeoverIntent.territoryId` stays internal/database-only in Phase 2; existing public Phase 1 response shape does not silently gain authority.

- [ ] **Step 1: Add compatibility assertions**

Assert old intent creation and preparation update still accept a valid opaque external reference, preserve it exactly, leave `territoryId` null unless a later explicitly authorized resolver links it, return `quoteAuthority: 'reference_only'`, and return `checkoutAvailable: false`. Assert ambiguous/unknown refs are not rewritten to a territory.

- [ ] **Step 2: Run Phase 1 tests**

Run:

```powershell
pnpm --filter @takeover/shared test -- company-claim.test.ts
pnpm --filter @takeover/api test -- company-identity-service.test.ts
pnpm --filter @takeover/api test:integration -- company-identity-postgres.test.ts
```

Expected: tests pass without implementing a resolver, checkout state, or price validation. If generated Prisma types require a code adjustment, make only the explicit null/preserve change.

- [ ] **Step 3: Commit**

```powershell
git add packages/shared/test apps/api/test apps/api/src/modules/company-identity/prisma-repository.ts
git commit -m "test(identity): preserve takeover intent territory seam"
```

### Task 10: Harden PostgreSQL Constraints and Concurrency

**Spec mapping:** database-level uniqueness, overlap prevention, append-oriented history, supported PostgreSQL evidence.

**Files:**

- Expand: `apps/api/test/integration/territory-ownership-concurrency.test.ts`
- Expand: `apps/api/test/integration/territory-postgres.test.ts`
- Modify migration only if a failing test proves the SQL invariant is incomplete.

- [ ] **Step 1: Add direct-SQL negative tests**

Attempt duplicate active rows, closed-range overlap, open-ended overlap, invalid dates, invalid versions, out-of-range weights, immutable field rewrite, second `endedAt` rewrite, and slug format violations. Query `pg_extension` to prove `btree_gist` exists.

- [ ] **Step 2: Add race tests**

Race first-capture inserts, replacements with identical expected version, and disabled-state change versus replacement. Require deterministic committed state, one increment, and no overlapping rows.

- [ ] **Step 3: Run the focused live suite repeatedly**

```powershell
1..5 | ForEach-Object { pnpm --filter @takeover/api test:integration -- territory-postgres.test.ts territory-ownership-concurrency.test.ts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

- [ ] **Step 4: Commit evidence-driven hardening only**

```powershell
git add packages/database/prisma/migrations apps/api/test/integration
git commit -m "test(database): harden territory ownership invariants"
```

### Task 11: Run Complete Verification and Scope Audit

**Spec mapping:** all acceptance criteria; no Phase 3 drift; independent deployability; preserve Phase 1.

**Files:** no product files unless a verification failure proves a defect.

- [ ] **Step 1: Verify dependency and static gates**

```powershell
pnpm install --frozen-lockfile
$env:DATABASE_URL=$env:TEST_DATABASE_URL
pnpm db:generate
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm format:check
```

- [ ] **Step 2: Verify all unit and production builds**

```powershell
pnpm test
pnpm build
pnpm smoke:api
```

Expected: shared/database/web/API tests and builds pass; compiled API `/health`, `/ready`, 404 envelope, and graceful shutdown remain green.

- [ ] **Step 3: Reset the dedicated PostgreSQL database and run all integration tests**

```powershell
$env:TAKEOVER_ALLOW_TEST_DATABASE_RESET='true'
pnpm db:test:prepare
pnpm test:integration
```

Expected: all migrations, `btree_gist`, seed idempotency, Phase 1 identity, Phase 2 public reads, and ownership concurrency pass on PostgreSQL 17.

- [ ] **Step 4: Run prohibited-scope scans**

```powershell
rg -n -i "model (Bid|Payment|WebhookEvent|Season|Battle|Leaderboard|ActivityEvent)|Dodo|Stripe|Razorpay|checkout|minimumTakeover|currentBid|takeoverPrice|WebSocket|Server-Sent|Redis|bullmq|queue|worker" packages/database/prisma apps/api/src packages/shared/src
rg -n "CONTESTED|controlled_correction|CONTROLLED_CORRECTION|currentOwnerCompanyId|previousOwnerCompanyId" packages/database/prisma apps/api/src packages/shared/src
rg -n "from ['\"](@prisma|fastify|node:)|@takeover/database" packages/shared/src
git status --short -- apps/web
```

Expected: only explicit Phase 3 exclusion comments/errors where justified; no prohibited implementation or shared coupling. Compare `apps/web` status and history with the snapshot captured at implementation start; preserve Claude's pre-existing/concurrent paths byte-for-byte unless a separately documented shared-contract incompatibility requires coordination.

- [ ] **Step 5: Record exact results**

Any unavailable PostgreSQL/extension evidence leaves Phase 2 `IN PROGRESS / UNVALIDATED`; do not weaken constraints or mark completion.

### Task 12: Synchronize Docs and Hand Off to Claude

**Spec mapping:** honest status, exact shared/API handoff, btree dependency, final files/results.

**Files:**

- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PHASES.md`
- Modify: `docs/MEMORY.md`
- Modify: `docs/PRD.md` or `docs/DESIGN.md` only if approved requirements changed.

- [ ] **Step 1: Update implementation status from evidence**

Mark only verified schema, seed, API, and concurrency work `IMPLEMENTED NOW`. Record PostgreSQL version, `btree_gist` evidence, commands, counts, warnings, and blockers.

- [ ] **Step 2: Add exact Codex -> Claude handoff**

List every final `@takeover/shared` export, six endpoints, query parameters, response shapes, decimal version behavior, five-entry preview, disabled/suspended semantics, `displayWeight` bands as frontend-only guidance, and explicit absences of price/checkout/contested/live activity.

- [ ] **Step 3: Run documentation consistency scans**

```powershell
rg -n "Phase 2|contested|displayWeight|btree_gist|TerritoryOwnership|checkoutAvailable|reference_only" docs
pnpm exec prettier --check docs packages/shared apps/api packages/database
git diff --check
```

- [ ] **Step 4: Commit documentation separately**

```powershell
git add docs/ARCHITECTURE.md docs/PHASES.md docs/MEMORY.md docs/PRD.md docs/DESIGN.md
git commit -m "docs: record phase 2 territory ownership status"
```

- [ ] **Step 5: Stop**

Report task-by-task status, commits, exports, schema/migration, seed counts, endpoints, security/privacy/concurrency results, PostgreSQL evidence, blockers, final tree, and Codex -> Claude handoff. Do not start Phase 3.

---

## API Response Shapes

### Territory list

```json
{
  "data": [
    {
      "id": "21000000-0000-4000-8000-000000000001",
      "slug": "ai-coding",
      "name": "AI Coding",
      "description": "AI-assisted software creation, review, and developer workflows.",
      "category": {
        "id": "20000000-0000-4000-8000-000000000001",
        "slug": "ai",
        "name": "AI"
      },
      "displayWeight": 100,
      "status": "unclaimed",
      "visualMetadata": { "iconKey": "code-2", "accentColor": "#A78BFA" },
      "version": "1",
      "createdAt": "2026-08-30T00:00:00.000Z",
      "updatedAt": "2026-08-30T00:00:00.000Z"
    }
  ],
  "meta": { "requestId": "request-id", "limit": 50, "nextCursor": "opaque" }
}
```

### Claimed territory detail

```json
{
  "data": {
    "id": "21000000-0000-4000-8000-000000000001",
    "slug": "ai-coding",
    "name": "AI Coding",
    "description": "AI-assisted software creation, review, and developer workflows.",
    "category": {
      "id": "20000000-0000-4000-8000-000000000001",
      "slug": "ai",
      "name": "AI"
    },
    "displayWeight": 100,
    "status": "claimed",
    "visualMetadata": { "iconKey": "code-2", "accentColor": "#A78BFA" },
    "version": "3",
    "currentOwnership": {
      "id": "ownership-id",
      "owner": {
        "id": "company-id",
        "slug": "acme",
        "name": "Acme",
        "websiteUrl": "https://acme.example/",
        "logoUrl": "https://acme.example/logo.png",
        "status": "suspended",
        "verificationLevels": ["contact_verified"]
      },
      "previousOwner": {
        "id": "previous-company-id",
        "slug": "previous",
        "name": "Previous",
        "websiteUrl": "https://previous.example/",
        "logoUrl": "https://previous.example/logo.png",
        "status": "active",
        "verificationLevels": ["contact_verified"]
      },
      "capturedAt": "2026-08-30T12:00:00.000Z",
      "territoryVersion": "3",
      "source": "paid_capture"
    },
    "ownershipHistoryPreview": [],
    "createdAt": "2026-08-30T00:00:00.000Z",
    "updatedAt": "2026-08-30T12:00:00.000Z"
  },
  "meta": { "requestId": "request-id" }
}
```

### Company territories

```json
{
  "data": {
    "company": {
      "id": "company-id",
      "slug": "acme",
      "name": "Acme",
      "websiteUrl": "https://acme.example/",
      "status": "active",
      "verificationLevels": ["contact_verified"]
    },
    "currentTerritoryCount": 2,
    "territories": []
  },
  "meta": { "requestId": "request-id", "limit": 50 }
}
```

`GET /api/territory-categories` returns `TerritoryCategory[]`. `GET /api/companies/:slug` returns `CompanyPublicSummary`. History returns `TerritoryHistoryEntry[]` with `capturedAt`, optional `endedAt`, owner, optional previous owner, decimal `territoryVersion`, and source. No Phase 2 response includes money or takeover eligibility.

## Test Matrix

| Area                                          | Unit/shared | HTTP               | PostgreSQL integration  | Concurrency           |
| --------------------------------------------- | ----------- | ------------------ | ----------------------- | --------------------- |
| Slug/category/displayWeight/visual validation | Yes         | Yes                | Constraints             | —                     |
| Public derived state                          | Yes         | Yes                | Yes                     | —                     |
| Current/previous owner and history            | Yes         | Yes                | Yes                     | Yes                   |
| Suspended/archived/draft projection           | Yes         | Yes                | Yes                     | —                     |
| Privacy allow-list                            | Yes         | Yes                | Yes                     | —                     |
| Pagination and cursor rejection               | Yes         | Yes                | Yes                     | —                     |
| Disabled territory behavior                   | Yes         | Yes                | Yes                     | Race with transfer    |
| Unique active ownership                       | —           | No mutation route  | Direct constraint       | Competing transitions |
| Non-overlapping ranges                        | —           | —                  | `btree_gist` direct SQL | Competing transitions |
| History immutability                          | Yes         | —                  | Trigger/direct SQL      | End/replacement race  |
| Version compare-and-swap                      | Yes         | —                  | Yes                     | Repeated race         |
| Seed validation/idempotency                   | Yes         | Read result        | Run twice               | —                     |
| Phase 1 intent compatibility                  | Shared/API  | Existing endpoints | Existing rows           | —                     |
| Phase 3 drift                                 | Static scan | Route inventory    | Schema inventory        | —                     |

## Plan Self-Review

- **Spec coverage:** Tasks 1–12 map shared contracts, schema, migration, `btree_gist`, seed gate/data, public projection, repository, ownership primitive, APIs, intent compatibility, PostgreSQL races, verification, and Claude handoff.
- **Placeholder scan:** no `TBD`, `TODO`, “similar to,” fake provider, fake owner, or unspecified test step exists. The seed task has an explicit product approval gate rather than missing content.
- **Type consistency:** shared names, repository records, decimal versions, source values, route list, and response fields are consistent across tasks and examples.
- **Scope check:** one shared module, three Prisma models, one deterministic seed, one Fastify module, six GET routes, and focused tests form a bounded Phase 2 implementation.
- **Boundary check:** no contested state, price, bid, checkout, payment, webhook, paid-capture orchestrator, mutation route, admin identity, season, battle, ranking, SSE, Redis, queue, or worker is implemented.
- **Concurrency check:** partial uniqueness, `btree_gist`, immutability trigger, row lock, compare-and-swap, and repeated PostgreSQL races provide independent evidence for ownership integrity.
