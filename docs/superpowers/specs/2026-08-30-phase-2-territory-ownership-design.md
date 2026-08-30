# TakeOver.com Phase 2 Territory + Authoritative Ownership Design

**Status:** PROPOSED / AWAITING REVIEW on 2026-08-30. This document is a design specification only; Phase 2 is not implemented.

## Purpose

Phase 2 makes territories and their ownership history authoritative, public, and queryable. It supplies the durable map that later pricing and paid capture workflows will operate against while preserving the product loop:

> See territory -> beat current price -> capture territory -> defend it -> build an empire.

This phase deliberately stops before bidding and payment. It can say who owns a territory and when that reign began; it cannot say what a takeover costs, accept a bid, begin checkout, or transfer ownership from a payment.

## Status and Phase Boundary

### IMPLEMENTED NOW

- Phase 0 monorepo, Fastify, Prisma/PostgreSQL, shared contracts, tests, and deployment boundaries.
- Phase 1 company drafts, verified contacts, company-scoped management capabilities, access requests, and reference-only `TakeoverIntent` preparation.
- `TakeoverIntent.territoryExternalRef` remains non-authoritative and `checkoutAvailable` remains `false`.

### PLANNED FOR PHASE 2

- Territory categories and deterministic territory seed data.
- Authoritative territories with backend-owned `displayWeight` and visual metadata.
- Durable territory ownership history and a single authoritative active ownership per territory.
- Public territory list, detail, history, category, and company-territory read APIs.
- Framework-neutral Phase 2 contracts in `@takeover/shared`.
- A backward-compatible relationship seam from Phase 1 takeover intents to authoritative territories.
- Database and integration tests for ownership, history, disabled state, and concurrency invariants.

### EXCLUDED FROM PHASE 2

- Bids, current winning amounts, opening prices, minimum takeover amounts, increment rules, fees, or quote calculation.
- Dodo Payments, checkout, payment records, webhooks, refunds, reconciliation, or paid capture.
- A public or company-authorized ownership mutation endpoint.
- Seasons, battles, leaderboard or empire scoring, activity events, SSE, Redis, queues, or workers.
- A general administrator UI or an operator identity system.
- Gameplay adjacency or neighbor rules inferred from the visual mosaic.

## Design Decisions

1. `TerritoryOwnership` rows are the sole source of ownership truth. `Territory` does not duplicate `currentOwnerCompanyId` or `previousOwnerCompanyId`.
2. PostgreSQL enforces at most one ownership with `endedAt IS NULL` for each territory. The active row is the one active owner reference.
3. Stored territory availability is `active` or `disabled`. Public state is derived as `disabled`, `claimed`, or `unclaimed`, in that priority order.
4. `contested` does not exist in Phase 2. Without authoritative bidding/payment state, emitting it would be fabricated.
5. A disabled territory may retain an active owner and its history. Disabling prevents future capture eligibility but does not rewrite ownership.
6. Ownership history is append-oriented. Owner, territory, capture time, source, and creation identity are immutable; ending a reign may only set `endedAt` once from null to a timestamp.
7. `displayWeight` is an authoritative positive integer configured with the territory. It is presentation priority, not price, score, ownership strength, or adjacency.
8. Mosaic position and physical CSS adjacency have no gameplay meaning.
9. Phase 2 exposes only public reads. The future Phase 3 capture orchestrator will be the first normal production caller allowed to transfer ownership.
10. Initial production data is deterministic and reviewable in version control. The initial seed contains categories and unclaimed territories, not fictional companies or ownership.

## Alternatives Considered

### Selected: normalized ownership history with derived current state

`TerritoryOwnership` stores every reign. A partial unique index identifies the only possible active reign. Public current and previous owners are selected from history in one repository query.

This avoids a second mutable owner column and makes history/current state disagreement structurally less likely. The trade-off is a join for territory reads, which PostgreSQL indexes and bounded queries can handle at V1 scale.

### Rejected: duplicate current-owner columns on `Territory`

Storing `currentOwnerCompanyId`, `currentOwnershipId`, and previous-owner fields directly on `Territory` could make reads simpler but creates two authoritative representations. Every transition and repair would have to keep the summary and history synchronized. Phase 2 does not need that risk or optimization.

### Rejected: event-only ownership projection

An immutable capture event stream plus a projected current-owner table can provide strong auditability, but it introduces projection rebuild, lag, and repair machinery before queues or workers are justified. A normalized reign table gives complete history and immediate current-state reads with less infrastructure.

## Domain Model

All IDs are UUIDs, timestamps are UTC `timestamptz`, database names are mapped to `snake_case`, and deletions use `RESTRICT` unless a later controlled-retention design explicitly says otherwise.

### `TerritoryCategory`

| Field          | Type                   | Rules                                             |
| -------------- | ---------------------- | ------------------------------------------------- |
| `id`           | UUID                   | Primary key; stable seed ID                       |
| `slug`         | varchar(100)           | Required, normalized lowercase kebab-case, unique |
| `name`         | varchar(100)           | Required, trimmed                                 |
| `description`  | varchar(500), nullable | Public copy                                       |
| `displayOrder` | integer                | Non-negative, deterministic category ordering     |
| `createdAt`    | timestamptz            | Required                                          |
| `updatedAt`    | timestamptz            | Required                                          |

Categories are taxonomy only. Category ordering and mosaic position do not create gameplay relationships.

### `Territory`

| Field                | Type           | Rules                                                                       |
| -------------------- | -------------- | --------------------------------------------------------------------------- |
| `id`                 | UUID           | Primary key; stable seed ID                                                 |
| `slug`               | varchar(120)   | Required, normalized lowercase kebab-case, unique                           |
| `name`               | varchar(120)   | Required, trimmed                                                           |
| `description`        | varchar(1,000) | Required public description                                                 |
| `categoryId`         | UUID           | Required foreign key to `TerritoryCategory`, `RESTRICT`                     |
| `displayWeight`      | integer        | Required, `1..100`; backend-authoritative presentation priority             |
| `availabilityStatus` | enum           | `ACTIVE` or `DISABLED`                                                      |
| `visualMetadata`     | jsonb          | Validated closed object described below                                     |
| `version`            | bigint         | Required, starts at `1`, increments on availability or ownership transition |
| `createdAt`          | timestamptz    | Required                                                                    |
| `updatedAt`          | timestamptz    | Required                                                                    |

`visualMetadata` is intentionally small and presentation-only:

```ts
type TerritoryVisualMetadata = {
  iconKey?: string;
  imageUrl?: string;
  accentColor?: `#${string}`;
};
```

- Unknown keys are rejected at the API/shared-contract boundary.
- `iconKey` is a bounded safe identifier, not executable markup.
- `imageUrl`, when present, must be public HTTPS. Phase 2 stores the validated reference and does not fetch it.
- `accentColor` must be exactly six hexadecimal RGB digits. It is decorative and never communicates state by itself.
- Seed validation applies the same schema before writing JSON.

`displayWeight` is not derived from price. The frontend may map its numeric value to temporary `flagship`, `major`, or `standard` tile tiers, but those tier names do not enter backend domain logic.

### `TerritoryOwnership`

| Field              | Type                   | Rules                                                                 |
| ------------------ | ---------------------- | --------------------------------------------------------------------- |
| `id`               | UUID                   | Primary key                                                           |
| `territoryId`      | UUID                   | Required foreign key to `Territory`, `RESTRICT`                       |
| `companyId`        | UUID                   | Required foreign key to `Company`, `RESTRICT`                         |
| `capturedAt`       | timestamptz            | Required reign start                                                  |
| `endedAt`          | timestamptz, nullable  | Null only for the active reign; if present, greater than `capturedAt` |
| `source`           | enum                   | `INITIAL_SEED`, `PAID_CAPTURE`, or `CONTROLLED_CORRECTION`            |
| `reason`           | varchar(500), nullable | Safe operational reason; required for controlled correction           |
| `territoryVersion` | bigint                 | Territory version established by this transition                      |
| `createdAt`        | timestamptz            | Required                                                              |

Phase 2 writes no production ownership rows through an HTTP route. `PAID_CAPTURE` is reserved for the Phase 3 capture transaction. `CONTROLLED_CORRECTION` is reserved for a later separately authorized operator workflow; it is not exposed in Phase 2. The initial seed strategy intentionally creates no fictional ownership, so `INITIAL_SEED` is available only for explicitly approved real launch data if that decision changes before implementation.

The ownership model has no amount, bid, payment, provider, season, battle, or score columns.

### Existing `Company` seam

Phase 2 reuses the Phase 1 `Company` model. It does not create a second company identity model. New relations are:

- `Company.territoryOwnerships`
- `Territory.ownershipHistory`
- nullable `TakeoverIntent.territoryId`, described below

Public responses never expose contact emails, challenges, grants, sessions, access requests, recovery state, or audit metadata.

## Territory State Model

The database stores availability separately from ownership:

| Availability | Active ownership | Public `status` | Meaning                                              |
| ------------ | ---------------- | --------------- | ---------------------------------------------------- |
| `ACTIVE`     | none             | `unclaimed`     | Discoverable and has no owner                        |
| `ACTIVE`     | one              | `claimed`       | Discoverable and authoritatively owned               |
| `DISABLED`   | none or one      | `disabled`      | Publicly readable but unavailable for future capture |

There is no stored `UNCLAIMED`, `CLAIMED`, or `CONTESTED` enum. Deriving the public state prevents a mutable `CLAIMED` flag from disagreeing with ownership history.

Disabled territories remain visible in direct detail/history responses and are included in list results unless the caller filters them out. Their owner and history remain accurate. Phase 2 returns no takeover-availability or price promise beyond the public `disabled` status.

## Authoritative Ownership Invariants

The migration and repository design must enforce:

1. A partial unique index on `territory_ownerships(territory_id) WHERE ended_at IS NULL` permits at most one active reign.
2. A check constraint requires `ended_at IS NULL OR ended_at > captured_at`.
3. A check constraint requires `territory_version > 0` and `territories.version > 0`.
4. A uniqueness constraint on `(territory_id, territory_version)` prevents two history rows from claiming the same transition version.
5. A PostgreSQL exclusion constraint prevents overlapping `[capturedAt, endedAt)` ranges for one territory. The implementation plan must explicitly review the required `btree_gist` extension and migration portability before adoption; if rejected, equivalent database-level overlap protection must be designed rather than silently omitted.
6. Foreign keys use `RESTRICT`; ordinary code never hard-deletes a territory, category, company referenced by history, or ownership row.
7. Slugs are unique and normalized before persistence. Database checks constrain their format.
8. `displayWeight` has a database check matching the shared schema (`1..100`).
9. The only permitted end-of-reign mutation is `endedAt: null -> transition timestamp`; attempts to change owner, territory, capture time, source, or version are rejected by repository policy and covered by tests.
10. A normal transfer transaction locks the `Territory` row, checks an optional expected version, ends the prior reign, creates the new reign at the same timestamp, increments `Territory.version` exactly once, and commits all changes together.
11. If the expected version is stale, no ownership or history row changes.
12. Public reads derive current and previous ownership from committed rows. Clients cannot submit or override ownership fields.

The Phase 2 implementation plan must decide whether invariant 9 also receives a database trigger after measuring the migration/maintenance cost. The partial unique, timeline, foreign-key, version, and range constraints are mandatory regardless.

## Internal Transition Boundary

Phase 2 designs and tests a transaction-bound ownership repository/domain primitive, not an externally callable capture operation. Conceptually:

```ts
type ReplaceActiveOwnershipInput = {
  territoryId: string;
  newOwnerCompanyId: string;
  expectedTerritoryVersion: bigint;
  transitionAt: Date;
  source: OwnershipSource;
  reason?: string;
};
```

The primitive must require a transaction client supplied by its caller and must not open a second transaction or escape to the global Prisma client. It enforces the ownership state change only; it does not validate a bid, payment, amount, verification capability, or checkout. Phase 3 will wrap it inside the larger paid-capture transaction after independently validating those facts.

No Phase 2 route invokes this primitive. Integration tests may exercise it directly against a dedicated PostgreSQL database to prove locking, rollback, stale-version, and single-owner behavior.

## Shared Contracts

Phase 2 adds a focused framework-neutral module such as `packages/shared/src/territory.ts`. It imports only Zod and existing shared public primitives. It contains no Fastify, Prisma, Node-only, payment, season, battle, leaderboard, or activity types.

### Core contracts

```ts
type TerritoryCategory = {
  id: string;
  slug: string;
  name: string;
  description?: string;
};

type TerritoryVisualMetadata = {
  iconKey?: string;
  imageUrl?: string;
  accentColor?: string;
};

type CompanyPublicSummary = {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string;
  logoUrl?: string;
  status: 'active' | 'suspended' | 'archived';
  verificationLevels: VerificationLevel[];
};

type TerritoryOwnershipSummary = {
  id: string;
  owner: CompanyPublicSummary;
  previousOwner?: CompanyPublicSummary;
  capturedAt: string;
  territoryVersion: string;
  source: OwnershipSource;
};

type TerritorySummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: TerritoryCategory;
  displayWeight: number;
  status: 'unclaimed' | 'claimed' | 'disabled';
  visualMetadata: TerritoryVisualMetadata;
  version: string;
  currentOwnership?: TerritoryOwnershipSummary;
  createdAt: string;
  updatedAt: string;
};

type TerritoryDetail = TerritorySummary & {
  ownershipHistoryPreview: TerritoryHistoryEntry[];
};

type TerritoryHistoryEntry = {
  id: string;
  owner: CompanyPublicSummary;
  previousOwner?: CompanyPublicSummary;
  capturedAt: string;
  endedAt?: string;
  territoryVersion: string;
  source: OwnershipSource;
};

type CompanyTerritories = {
  company: CompanyPublicSummary;
  currentTerritoryCount: number;
  territories: TerritorySummary[];
};
```

`version` and `territoryVersion` are decimal strings in JSON because the database uses `bigint` and JavaScript numbers cannot represent every 64-bit integer safely. `currentTerritoryCount` counts authoritative active ownership rows, including a disabled territory whose ownership has not ended. It is not an empire score or leaderboard metric.

The Phase 2 implementation plan may factor common fields into schemas, but the public exported names must remain clear. It must not replace or duplicate Phase 1 `Company`, `CompanyInput`, `CompanyVerification`, or management contracts. `CompanyPublicSummary` is explicitly a privacy-safe public projection, not a competing company aggregate.

### Pagination contracts

List and history endpoints use an opaque cursor with deterministic ordering. Shared contracts define:

- `PaginationQuery`: optional `cursor`, `limit` default 50 and maximum 100.
- `PageMeta`: optional `nextCursor`, plus the effective `limit`.
- `TerritoryListQuery`: pagination plus optional category slug and public status filter.

The cursor is an API implementation detail and must not be decoded or constructed by the frontend.

## Public API Design

All routes are unauthenticated, read-only, and use the existing success/error envelopes. Dates are ISO 8601 UTC strings. Unknown resources return the stable not-found error without exposing private company state.

### `GET /api/territory-categories`

Returns public categories ordered by `displayOrder`, then name and ID. Categories with no territory may remain visible only when present in the deterministic seed; the initial seed should avoid empty categories.

### `GET /api/territories`

Query parameters:

- `category`: exact category slug.
- `status`: `unclaimed`, `claimed`, or `disabled`.
- `cursor`: opaque continuation cursor.
- `limit`: 1 through 100, default 50.

Default ordering is `displayWeight DESC`, then `name ASC`, then `id ASC`. The response contains `TerritorySummary[]` and page metadata. It exposes no price or synthetic activity.

### `GET /api/territories/:slug`

Returns `TerritoryDetail`, including current ownership, previous owner with `logoUrl` when available, and a small bounded history preview. It returns disabled territories honestly. It does not emit an opening price, current bid, legal minimum, takeover eligibility, or `contested` state.

### `GET /api/territories/:slug/history`

Returns cursor-paginated `TerritoryHistoryEntry[]` ordered by `capturedAt DESC`, then `id DESC`. Every row includes `capturedAt`; completed reigns include `endedAt`. The current reign is returned first when present.

### `GET /api/companies/:slug`

Returns a privacy-safe public company projection plus `currentTerritoryCount`. It exposes only companies eligible for public presentation. Historical territory responses may still use a safe archived-company summary so history remains intelligible.

### `GET /api/companies/:slug/territories`

Returns the public company summary, authoritative current territory count, and cursor-paginated currently owned territories. Disabled territories remain included because disabling does not end ownership. The response makes no empire-score or rank claim.

## Query and Repository Architecture

Phase 2 adds one real API module, `apps/api/src/modules/territories`, when implemented. It should contain only the route, service/query mapping, repository interface/Prisma implementation, and focused tests required by this phase.

- Routes parse shared schemas and translate stable results/errors.
- Query services own visibility policy, derived status, response mapping, ordering, and cursor validation.
- The repository owns Prisma/PostgreSQL joins, locks, and transaction-bound ownership persistence.
- Shared schemas never receive Prisma records directly; mapping explicitly excludes private company/contact fields.
- Reads may use joins or bounded batched queries. No cache is introduced without evidence.
- A database inconsistency such as two active owners is an operational error, never resolved by arbitrarily selecting one row.

## Company Public Profile Rules

`CompanyPublicSummary` exposes only:

- stable ID and non-null public slug;
- company name;
- public website and optional logo URL;
- safe public lifecycle status;
- currently verified public verification levels.

It does not expose contact identifiers or emails, verification evidence, management authority, session state, access requests, or internal failure reasons.

The public current-territory count is derived with the ownership query. It is not stored on `Company`. Phase 4 may introduce independently reproducible aggregates if measured query cost justifies them.

Draft companies are not publicly discoverable. If a draft company is encountered as an ownership owner, the API treats it as an integrity failure rather than leaking the draft. Suspension and archival presentation policy is preserved in historical summaries; whether a suspended current owner remains visible but non-participating must be finalized before implementation.

## Phase 1 `TakeoverIntent` Integration

Phase 2 must not reinterpret existing Phase 1 references silently.

1. Add nullable `TakeoverIntent.territoryId` with a `RESTRICT` foreign key to `Territory`.
2. Retain `territoryExternalRef` as the original user/preparation reference for compatibility and audit explanation.
3. Existing rows are not blindly rewritten. A migration may link a row only when its reference exactly matches one unambiguous seeded territory slug; unmatched references remain null.
4. Phase 1 responses keep `quoteAuthority: 'reference_only'` and `checkoutAvailable: false`.
5. Phase 2 public read APIs do not mutate or validate takeover intent state.
6. When an intent is explicitly resumed in Phase 3, the server resolves the authoritative territory by ID or exact slug, stores the relationship, loads the current version/owner/pricing state, and requires review when the reference is missing, invalid, disabled, or stale.
7. Phase 2 adds no `ready_for_checkout` transition and no quote acceptance endpoint.

This design lets Claude link territory selection to a stable public ID/slug while preserving the honest Phase 1 boundary.

## Initial Seed Strategy

Phase 2 uses an idempotent, deterministic seed owned by `packages/database`.

- Categories and territories have committed stable UUIDs and slugs.
- Seed records contain approved name, description, category, `displayWeight`, availability, and validated visual metadata.
- The seed validates its entire input before starting a transaction.
- Upserts key by stable ID and assert that a slug is not already owned by another ID.
- The seed never deletes records absent from the file. Removal is represented by an explicit reviewed disable change.
- Re-running the same seed produces no ownership or history rows and no semantic drift.
- The initial seed creates all territories unclaimed. It never creates fictional companies, verification, management grants, payment, ownership, or activity.
- The implementation plan will list the proposed initial taxonomy/data and require product review before treating it as production seed content.

A full territory admin interface is deferred. Until operator authorization exists, production changes happen through reviewed seed/migration changes rather than an unauthenticated mutation route.

## Error Handling

Planned stable errors include:

- `TERRITORY_NOT_FOUND`
- `TERRITORY_CATEGORY_NOT_FOUND`
- `COMPANY_NOT_FOUND`
- `INVALID_CURSOR`
- `STALE_TERRITORY_VERSION` for the internal transition boundary
- `TERRITORY_DISABLED` for future mutation callers, not public reads
- `OWNERSHIP_CONFLICT`
- `OWNERSHIP_HISTORY_INVALID`

Database uniqueness, exclusion, and foreign-key failures are translated at the repository/service boundary. Public errors contain a request ID and safe details only. Raw SQL, private company state, and internal IDs not already part of the public contract are not leaked.

## Testing Strategy

### Shared-contract tests

- Accept valid territory/category/ownership/company-public responses.
- Reject invalid slugs, unsafe visual metadata, unknown visual keys, non-integer or out-of-range `displayWeight`, invalid dates, unsafe bigint versions, and private fields.
- Confirm Phase 1 company and takeover-intent contracts remain backward compatible.

### Pure domain/query tests

- Derive `unclaimed`, `claimed`, and `disabled` correctly.
- Never derive `contested`.
- Map `displayWeight` without price assumptions.
- Derive current and previous owner consistently.
- Derive reign duration from `capturedAt`/`endedAt` without persisting a drifting duration.
- Exclude private company/contact data.
- Validate deterministic cursor ordering and status/category filters.

### PostgreSQL integration tests

- Unique territory and category slugs.
- `displayWeight` database bounds.
- One active ownership per territory under direct and concurrent attempts.
- Non-overlapping history and `endedAt > capturedAt`.
- Atomic old-reign end/new-reign creation with one version increment.
- Stale expected version rolls back without changing history.
- Ownership identity fields cannot be changed through the normal repository.
- Disabled territory behavior preserves owner/history and blocks the internal mutation policy where applicable.
- Company public territory lookup returns only current ownership and includes disabled holdings.
- History order, previous-owner projection, and archived-owner safe projection.
- Deterministic seed is idempotent and creates no ownership.
- Nullable intent relationship preserves unresolved Phase 1 external references.

### HTTP tests

- Territory/category list, filter, pagination, detail, history, company detail, and company-territory routes.
- Unknown slug and invalid cursor errors use stable envelopes.
- Disabled territories remain readable with truthful status.
- Responses contain no bid, price, payment, contact, grant, session, or management fields.

### Phase-drift scan

The Phase 2 verification plan must scan for and reject Dodo/Stripe/Razorpay SDKs, checkout/payment/webhook routes, bid/pricing logic, capture-from-browser behavior, season/battle/leaderboard/SSE modules, Redis, queues, and workers.

## Acceptance Criteria

Phase 2 may be marked complete only when:

1. The migration applies to a dedicated PostgreSQL test database.
2. Deterministic seed validation and idempotent execution pass.
3. Public shared contracts are exported from `@takeover/shared` with no framework/Prisma coupling.
4. Public territory/category/company APIs pass unit, HTTP, and PostgreSQL integration tests.
5. PostgreSQL proves one active owner and non-overlapping history under concurrency.
6. Territory version compare-and-swap behavior rolls back stale transitions.
7. Disabled territory semantics are consistent across detail, lists, company holdings, and internal mutation policy.
8. Existing Phase 1 contract and integration suites remain green.
9. Builds, typecheck, lint, formatting, Prisma generation/validation, compiled API smoke, and prohibited-scope scans pass.
10. `MEMORY.md`, `PHASES.md`, and `ARCHITECTURE.md` are updated with only verified implementation claims and an exact Codex -> Claude contract handoff.

## Security and Privacy Review

- Every Phase 2 API is read-only and intentionally public.
- Public company projections are allow-listed; repository records are never serialized wholesale.
- Slugs, filters, cursor, and limits are server-validated.
- Stored image references are never fetched by the API in this phase, avoiding a new SSRF surface.
- No route can manufacture ownership, history, verification, or management authority.
- Ownership mutation remains transaction-bound and inaccessible over HTTP.
- Audit/operator mutation design is deferred rather than protected by a fake administrator identity.

## Claude Handoff Fields

Once implemented and explicitly recorded in `MEMORY.md`, Claude may consume:

- `TerritoryCategory`
- `TerritoryVisualMetadata`
- `TerritorySummary`
- `TerritoryDetail`
- `TerritoryOwnershipSummary`
- `TerritoryHistoryEntry`
- `CompanyPublicSummary`
- `CompanyTerritories`
- public territory status and ownership-source constants/schemas
- pagination/query schemas and response contracts

Important presentation semantics:

- `displayWeight` is authoritative input to the Value Mosaic; Claude chooses the responsive tile-tier thresholds.
- A tile's physical position or CSS adjacency has no gameplay meaning.
- `status` is authoritative and never inferred by the frontend from owner presence alone.
- `currentOwnership.owner` and optional `previousOwner`, including `logoUrl`, support current-reign and dethroning presentation.
- `capturedAt` and `endedAt` support deterministic client-side duration formatting; the API does not send a drifting duration string.
- No Phase 2 response contains current bid, minimum takeover, checkout availability, live activity, rank, or payment success.

## Unresolved Questions Requiring Review

1. **Suspended current owners:** should a suspended company remain publicly named as current owner while future capture/management actions are blocked, or should public presentation use a moderation-safe placeholder? The ownership record must remain intact either way.
2. **Controlled corrections:** is `CONTROLLED_CORRECTION` worth reserving in the initial enum, or should it be added only alongside the future operator authorization/repair design?
3. **Timeline exclusion:** approve PostgreSQL `btree_gist` for a database-level no-overlap constraint, or require a different equally strong database enforcement mechanism.
4. **History preview size:** the detail response needs a small fixed preview; five entries is recommended, with full history available from the paginated endpoint.
5. **Initial taxonomy:** the exact V1 category/territory seed list, copy, visual metadata, and numeric weights require product review in the implementation plan.

None of these questions permits payment, bidding, capture, or contested-state implementation in Phase 2.

## Canonical Documentation Reconciliation After Approval

No canonical document is changed by this proposed specification. If this design is approved, the implementation-plan documentation step must reconcile these existing planned statements before implementation:

- `PRD.md` and `DESIGN.md` currently list `contested` as a territory/ownership state. They must say it is absent from Phase 2 and reserved for a later authoritative bidding definition.
- `PHASES.md` currently includes Phase 2 admin create/update/disable workflows. It must instead record deterministic reviewed seed changes and defer general operator mutations until operator authorization exists.
- `ARCHITECTURE.md` currently describes duplicated current owner, previous owner, amount, and reign fields on a territory summary. It must describe `TerritoryOwnership` as the sole owner/history truth, derived public projections, and price/amount fields as Phase 3 concerns.
- `MEMORY.md` currently requests authoritative `displayWeight`; after implementation it may be marked available only with verified schema/API evidence and an exact Claude handoff.

This reconciliation changes planned architecture only. Phase 0 and Phase 1 implementation claims remain untouched.

## Self-Review

- **Placeholder scan:** no `TBD`, `TODO`, fake owner, fake price, or incomplete success claim is present.
- **Internal consistency:** current ownership has one source of truth; public state is derived; disabled ownership is preserved; bigint versions are serialized safely.
- **Scope check:** one Prisma migration, deterministic seed, one focused API module, shared read contracts, and public read endpoints form one bounded implementation plan.
- **Ambiguity check:** contested state, pricing, writes, seed ownership, intent compatibility, public privacy, and display-weight semantics are explicit.
- **Phase boundary check:** no payment provider, checkout, bid, price, webhook, paid capture, SSE, season, battle, leaderboard, queue, worker, or Redis behavior is claimed or planned for Phase 2.
- **Canonical-doc check:** four planned statements requiring post-approval reconciliation are listed explicitly; no canonical file was edited prematurely.
