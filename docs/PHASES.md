# TakeOver.com Delivery Phases

> Status values are **IMPLEMENTED NOW**, **IN PROGRESS / UNVALIDATED**, **PLANNED**, and **BLOCKED**. A phase is complete only when every acceptance criterion has current evidence.

## Phase 0 — Foundation

**Objective:** Establish a boring, stable, runnable, documented monorepo.

**Dependencies:** Node.js 24, pnpm 10, Git, and package-registry access. Schema validation does not require a live PostgreSQL server.

**Status:** **IMPLEMENTED NOW — PHASE 0 ACCEPTANCE VERIFIED.** Applying the committed migration to a live PostgreSQL instance remains **UNVALIDATED / NEEDS REVIEW** and is not a Phase 0 success claim.

**Tasks:**

- [x] Audit the initially empty repository.
- [x] Approve and commit the Phase 0 design specification.
- [x] Approve and commit the detailed implementation plan.
- [x] Create and cross-check all six canonical docs (`470d31c`).
- [x] Establish pnpm workspaces and strict shared tooling; verify `pnpm install` (`c71f2f5`).
- [x] Create/test framework-neutral shared contracts (`68d3995`).
- [x] Create/validate the Prisma 7/PostgreSQL foundation (`90d8cde`).
- [x] Create/test the Fastify runtime and health endpoints (`650a30c`).
- [x] Create/build the minimal Next.js application (`dd0ec77`).
- [x] Run the complete acceptance suite and prohibited-architecture scan.

**Acceptance criteria:** dependency installation; web/API type checks; lint; tests; production builds; Prisma schema validation; compiled API startup; `/health` and `/ready` responses; no prohibited dependencies, fake product state, or placeholder product modules; honest docs and handoff.

**Tests:** shared money/envelope unit tests, database lifecycle unit test, API configuration and injection tests, web static/build verification, and compiled API runtime smoke test.

**Verification evidence (2026-08-29):** frozen install passed; Prisma Client `7.10.0` generation passed; schema validation passed; all workspace typechecks and lint passed; 31 tests passed; formatting passed; API and web production builds passed; compiled API startup, `/health`, `/ready`, 404 envelope, and graceful shutdown passed; prohibited dependency, placeholder, Prisma-ownership, and shared-boundary scans passed.

**Unvalidated:** `prisma migrate deploy` and runtime queries against a live PostgreSQL server were not run because no database instance was provisioned. The committed migration was compared with offline `prisma migrate diff` output.

**Risks:** ecosystem incompatibility across pinned tools; claiming database readiness without a live database; documentation drifting during later changes; optional standalone packaging requires re-evaluation in an environment that permits pnpm symlink creation.

## Phase 1 — Company + Claim Identity

**Objective:** Implement low-friction company/contact identity and revocable company-scoped management capabilities without introducing traditional V1 user accounts.

**Dependencies:** Verified Phase 0; approved Phase 1 design and locked V1 defaults; PostgreSQL integration-test environment. Production email delivery and manual approval execution remain unavailable until separately selected/designed.

**Status:** **IMPLEMENTED NOW — LOCAL AND POSTGRESQL ACCEPTANCE VERIFIED**

**Tasks:** company identity and drafts; contact-email verification; purpose-bound opaque challenges; management grants; short-lived company-scoped HttpOnly sessions; access requests; approve/reject/cancel/expire transitions; notification throttles; manual-recovery request architecture; authorization policies; rate limits; audit trail; `TakeoverIntent` contract/state seam only.

**Explicit exclusions:** no `User` model, passwords, signup/login, password reset, global end-user roles/session/dashboard, territory/ownership implementation, checkout, payment provider, webhook, or capture implementation.

**Acceptance criteria:** a contact verifies email through a single-use expiring challenge; raw tokens are not persisted/logged; links exchange into short-lived company-scoped sessions; Company A authority fails for Company B; a different contact cannot manage or pay for an existing managed company until approved; approval creates only the intended grant; rejection grants nothing and cancels/expires the prepared intent; manual recovery cannot transfer authority automatically; sensitive actions are rate-limited and audited; quote snapshots are explicitly non-binding; Phase 0 workspace boundaries remain intact.

**Tests:** challenge purpose/success/failure/expiry/replay/revocation; secure cookie and CSRF/Origin behavior; unauthorized and cross-company actions; grant/session revocation; pending-request checkout denial; concurrent approve/reject; notification/request rate limits; enumeration-safe issuance; audit atomicity; quote-staleness state transitions; PostgreSQL integration behavior.

**Risks:** email compromise or delivery failure; bearer-link leakage/scanners; company squatting/collisions; access-request spam; stale sessions; cross-company privilege escalation; unavailable managers; unsafe manual recovery; cookie topology errors; and accidentally building a global user abstraction through contacts.

**Verified evidence (2026-08-30):** shared, API unit/HTTP, security, PostgreSQL persistence, and concurrent approve/reject tests pass; both migrations apply to a dedicated PostgreSQL 17 test database; independent builds and compiled API smoke pass. Production email delivery and manual-recovery execution remain unavailable by design and are not completion claims. A traced `@prisma/adapter-pg`/`pg` deprecation warning remains documented for upgrade review.

## Phase 2 — Territories + Authoritative Ownership

**Objective:** Create authoritative territory discovery and ownership-history foundations.

**Dependencies:** verified Phase 1; approved Phase 2 design; reviewed initial seed table; PostgreSQL 17 integration environment with `btree_gist` support.

**Status:** **PLANNED**

**Tasks:** framework-neutral shared contracts; categories and territories; authoritative `displayWeight`; deterministic reviewed seed infrastructure; public company projection; list/detail/history/company-territory APIs; ownership history; one active reign; non-overlapping timelines; transaction-bound ownership primitive; nullable `TakeoverIntent.territoryId` compatibility seam.

**Explicit exclusions:** no contested state, bid/pricing fields, payment, Dodo, checkout, webhook, paid capture orchestration, ownership mutation HTTP endpoint, general admin interface, seasons, battles, leaderboard/empire scoring, activity/SSE, Redis, queue, or worker.

**Acceptance criteria:** stable public contracts; deterministic seed is validated/idempotent and creates no fictional ownership; `TerritoryOwnership` is the sole owner truth; PostgreSQL enforces one active reign and non-overlapping history with `btree_gist`; stale versions roll back; disabled ownership remains truthful; suspended owners remain publicly named; public reads leak no private identity state; Phase 1 behavior remains compatible.

**Tests:** shared schemas; list/filter/detail/history/company reads; slug and weight constraints; deterministic seed; active-owner and overlap constraints; history immutability; version concurrency; disabled state; suspended-owner projection; intent compatibility; PostgreSQL migration/concurrency; complete scope-drift scan.

**Risks:** taxonomy churn, accidental private-company leakage, cursor instability, direct history mutation, unsupported `btree_gist`, migration/backfill ambiguity, and accidental Phase 3 pricing/payment drift.

## Phase 3 — Capture Engine

**Objective:** Safely convert a verified payment into one atomic territory transfer.

**Dependencies:** Phases 1–2; payment-provider contract; pricing rules; PostgreSQL concurrency environment; refund/dispute policy.

**Status:** **PLANNED — HIGH RISK**

**Tasks:** legal-minimum pricing; takeover-intent revalidation; bid validation; provider-neutral payment abstraction; `DodoPaymentProvider`; checkout; signature-verified Dodo webhooks; provider-neutral payment records; atomic transfer; duplicate request/event protection; concurrency; history; explicit reconciliation/refund/cancellation architecture.

**Acceptance criteria:** server computes the amount; only a `contact_verified` company with valid company-scoped authority can start checkout; existing-company access is already approved; stale quotes require explicit review and are never auto-charged; only a verified matching server-side Dodo payment event transfers ownership once; browser return URLs cannot capture; stale/concurrent/duplicate/mismatch cases preserve invariants; unfulfillable confirmed payments enter reconciliation/refund state; every attempt is auditable.

**Tests:** below-minimum, valid, stale, two simultaneous bidders, duplicate request, duplicate webhook, payment failure/success, invalid signature, wrong amount/currency/reference, ownership history, previous owner, rollback, and provider retry.

**Risks:** financial loss, double ownership, webhook replay, stale UI, provider ambiguity, Dodo integration drift, refunds/disputes, and partially committed side effects. Dodo signature/event/retry/refund behavior is **UNVALIDATED / NEEDS REVIEW** until checked against current official documentation.

## Phase 4 — Competition

**Objective:** Derive trustworthy empire statistics, rankings, and live capture activity.

**Dependencies:** Phase 3 authoritative captures; approved scoring configuration; event-delivery design.

**Status:** **PLANNED**

**Tasks:** company statistics; centralized empire scoring; leaderboards; activity events; contention; reign duration; capture counts; SSE delivery where validated.

**Acceptance criteria:** stats reproduce from source records; scoring version/configuration is explicit; leaderboard ties are deterministic; clients receive only committed events and can recover missed state.

**Tests:** scoring vectors, rank ties, aggregation reconciliation, event authorization, reconnect/replay behavior, and no pre-commit publication.

**Risks:** score gaming, aggregation drift, event loss/duplication, and deployment connection limits.

## Phase 5 — Seasons

**Objective:** Run retry-safe competitions with frozen, auditable final results.

**Dependencies:** Phase 4 scoring/ranking; approved schedule and reset policy; reliable job execution.

**Status:** **PLANNED**

**Tasks:** lifecycle; configurable duration; statistics; start/end jobs; rollover; archives; Hall of Fame; territory reset configuration.

**Acceptance criteria:** one current season; rollover retries safely; final ranks never drift; next season opens exactly once; configured ownership/reset policy is applied atomically or recoverably.

**Tests:** lifecycle transitions, boundary time, frozen rankings, rollover retry/concurrency, Hall of Fame, reset policies, and recovery.

**Risks:** duplicate jobs, clock boundaries, long transactions, partial rollover, and unclear ownership reset expectations.

## Phase 6 — Battles

**Objective:** Add an explicit rivalry state machine using only verifiable scoring inputs.

**Dependencies:** authoritative companies/territories; approved battle rules and trustworthy measurement sources.

**Status:** **PLANNED / NEEDS REVIEW**

**Tasks:** challenge model; challenger/defender; territory selection; start/end; transitions; timeline; scoring interface; winner determination and reasons.

**Acceptance criteria:** legal transitions enforced; participants authorized; timing deterministic; results reproducible and auditable; unverifiable dimensions cannot affect winners.

**Tests:** transition table, timing, authorization, duplicate challenge, score reconciliation, tie/cancel/expiry, and immutable outcome.

**Risks:** invented metrics, manipulation, disputes, unclear stakes, and feature complexity distracting from capture reliability.

## Phase 7 — Growth

**Objective:** Make authoritative territory moments discoverable, shareable, and measurable.

**Dependencies:** stable public APIs and activity; privacy/attribution policy.

**Status:** **PLANNED**

**Tasks:** share events; Open Graph metadata; public stats; referrals; tracking; SEO-supporting APIs.

**Acceptance criteria:** shared pages reflect committed state; metadata is cache-correct; attribution avoids double counting; no private data leaks; analytics cannot affect gameplay.

**Tests:** metadata, caching, referral idempotency, privacy filters, crawler behavior, and analytics failure isolation.

**Risks:** stale social previews, privacy leakage, metric fraud, SEO abuse, and tracking complexity.

## Phase 8 — Admin & Safety

**Objective:** Give operators controlled, audited tools to review and protect the marketplace.

**Dependencies:** a separately approved operator identity/authorization model, audit records, domain state machines, and written moderation/repair policy. Company management sessions never imply administrator authority.

**Status:** **PLANNED**

**Tasks:** moderation; audit search; suspicious activity; company/verification review; territory controls; payment/webhook investigation; suspension; controlled repair; abuse controls; rate limiting.

**Acceptance criteria:** least privilege; every mutation audited; financial history is preserved; repair workflows are explicit/reviewable; suspicious actions are observable; denial tests pass.

**Tests:** unauthorized admin, operator-permission matrix, mutation audit atomicity, suspension effects, repair invariants, rate limits, and sensitive-data filtering.

**Risks:** excessive privilege, irreversible operator mistakes, audit leakage, inconsistent repair, and false-positive abuse controls.

## Phase 9 — Production

**Objective:** Demonstrate operational, security, and financial readiness for launch.

**Dependencies:** accepted V1 feature phases; selected hosting/providers; operational ownership.

**Status:** **PLANNED**

**Tasks:** monitoring; alerts; backups; restore exercise; migration checks; load/concurrency tests; security review; payment sandbox/live-mode gates; deployment; runbooks; launch checklist.

**Acceptance criteria:** SLOs and alerts are actionable; restore meets targets; migrations rehearse safely; capture invariants hold under load; secrets and headers pass review; provider scenarios pass; rollback and incident procedures are exercised.

**Tests:** load, soak, concurrency, failover, backup restore, migration rollback/recovery, dependency/security scan, payment/provider suite, and deployment smoke tests.

**Risks:** incomplete observability, provider outage, database saturation, migration downtime, credential exposure, and launching with untested recovery.
