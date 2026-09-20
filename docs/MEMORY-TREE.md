# TakeOver V1 memory tree

Updated 2026-09-20. This is the working index; check Git and fresh test output before asserting completion.

```text
TakeOver V1
├── Workspace
│   ├── Original: D:/Documents/projects/takeover (main, d20aa11)
│   ├── Implementation: .worktrees/v1-completion
│   └── Branch: feat/v1-completion; verified, awaiting commit/integration
├── Approved scope
│   ├── Finish documented V1; exclude battles and referrals
│   ├── Score: 100 per active territory + 25 per distinct category
│   ├── Ties: stable company ID order
│   ├── Seasons: configurable 30 days, preserve paid ownership, freeze results
│   ├── Operator: independent bearer credential, permissions, audited changes
│   └── Activity: committed durable capture events and resumable SSE
├── Design and plan
│   ├── superpowers/specs/2026-09-20-v1-completion-design.md
│   └── superpowers/plans/2026-09-20-v1-completion.md
├── Implementation streams
│   ├── competition agent: schema/migration, scores, seasons, SSE, public pages
│   ├── operator agent: protected APIs, moderation/recovery, tests, OPERATIONS.md
│   ├── email agent: Resend adapter, safe delivery, public share/company stats UI
│   └── coordinator: runtime/env wiring, readiness/security, deployment/CI, review
├── Verified 2026-09-20 (whole-change pass, this worktree)
│   ├── Pinned pnpm 10.32.1 works when invoked directly (not corepack pnpm)
│   ├── Docker takeover-v1-test (PostgreSQL 17) reset; all 8 migrations applied
│   ├── pnpm typecheck: all packages pass
│   ├── pnpm lint: all packages pass
│   ├── pnpm test: 622 passed (shared 105, web 228, database 16, api 273)
│   ├── pnpm test:integration: 156 passed (database 58, api 98)
│   ├── pnpm build: shared, database, api, web (17 routes) succeed
│   └── pnpm smoke:api: compiled production runtime passes health/ready/404/shutdown
├── Fixed during this pass (both have regression tests)
│   ├── Non-terminal payment webhook after refund now reports terminal REFUNDED status
│   ├── LOG_LEVEL now applied to the Fastify logger (was parsed but ignored)
│   ├── database phase3 suite now cleans up its rows (broke API global-count tests in CI order)
│   └── verify.yml live-resource env scoped to build step (was breaking web fixture tests)
├── Test infrastructure
│   ├── Container: takeover-v1-test, PostgreSQL 17, loopback port 55439 (compose.test.yaml default 55440)
│   ├── Database: takeover_v1_test (disposable, no production data)
│   ├── Only one integration suite at a time: tests may truncate fixtures
│   ├── Unit test command excludes database integration suites
│   ├── Integration requires TEST_DATABASE_URL and TAKEOVER_ALLOW_TEST_DATABASE_RESET=true
│   ├── Prisma migrate reset additionally needs explicit user consent when run by an agent
│   └── Integration timeout is 30s for measured Windows startup delay
├── Remaining work
│   ├── Commit feat/v1-completion and integrate into the user's main checkout
│   └── External launch gates below (not software work)
└── External launch gates (not performed)
    ├── Verified email sender and actual delivery credentials
    ├── Dodo sandbox end-to-end payment/refund validation
    ├── Hosting/TLS and provider/operator secret configuration
    ├── Production backup/restore drill, alert delivery and load evidence
    └── Policy/operational sign-off; no live payments or deployment performed
```

## Invariants

Use `@takeover/shared` for public contracts and `packages/database` as sole Prisma owner. No traditional user accounts. Company sessions never grant operator authority. Payment confirmation, ownership and management authority remain separate. Preserve ownership and financial history. Unknown refund outcomes retain claims until reconciled. Never mark external launch gates complete from unit tests.

## Continuation protocol

Read this index, the implementation plan and current Git diff. Ask active agents for their latest status before editing their files. Resume unfinished tasks; do not repeat completed migrations or reset the shared test database while another suite runs. Record final acceptance counts only from the completed commands.
