# V1 Completion Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement independent tasks and review the integrated result.

**Goal:** Complete the approved V1 software and establish reproducible acceptance evidence, with external launch gates reported honestly.

**Architecture:** Feature-local Fastify modules consume shared Zod contracts and Prisma repositories. Next.js pages consume public APIs; financial state remains authoritative in PostgreSQL.

**Tech Stack:** Existing TypeScript, Fastify, Next.js, PostgreSQL, Prisma, pnpm and Vitest.

## Global constraints

- Use @takeover/shared for public contracts; packages/database solely owns Prisma.
- No traditional user accounts, fabricated activity, client-authoritative state, battles or referrals.
- Score: 100 per active territory plus 25 per distinct category; company-ID tie ordering.
- Default 30-day seasons preserve paid ownership and freeze final results.
- Operator bearer authority is independent of company management sessions; every mutation is audited.
- Keep existing payment/refund and ownership invariants intact.

## Task 1: Competition and seasons

Own modules/competition, shared competition contracts, new competition database migration/models, and web competition pages. Build deterministic score vectors and historical-boundary tests first; implement authoritative stats, leaderboard, resumable activity/SSE, serializable retry-safe rollover and immutable archives. Add PostgreSQL tests for concurrency and frozen results. Export a registration function for app.ts integration by the coordinator. Own schema.prisma changes exclusively. Run focused tests and typecheck, then report exact runtime integration instructions.

- [ ] Scoring and contracts tested.
- [ ] Rankings, public statistics and activity implemented.
- [ ] Season lifecycle, snapshots and Hall of Fame implemented.
- [ ] Web surfaces implemented.
- [ ] Database and HTTP acceptance verified.

## Task 2: Essential operator tools

Own modules/operator, shared operator contracts, operator tests and operator runbook. Use existing models and AuditLog; do not modify schema.prisma or app.ts. Implement independent credential configuration/validation, permission matrix, bounded read APIs and transactional moderation/recovery decisions with mandatory reason. Reject unauthorized requests, company cookies, privilege mismatches and stale mutations. Supply registration interface to coordinator. Add PostgreSQL audit and authority tests.

- [ ] Authorization and denial tests written first.
- [ ] Read and mutation APIs implemented.
- [ ] Audited recovery and moderation verified.
- [ ] Operator runbook written.

## Task 3: Launch foundation and integration

Coordinator owns app.ts, env.ts, email provider/plugin, deployment, test command separation and CI. Fix baseline test discovery so pnpm test needs no database and test:integration requires an explicitly named dedicated test DB. Add production email provider behind the existing interface with request timeout, safe failures and mocked transport tests. Integrate new registration interfaces. Add safe deployment examples and runbooks, never auto-enable real payments. Verify build, lint, unit, dedicated-Postgres integration and compiled smoke. Add public sharing metadata as needed after inspecting existing routes.

- [ ] Reproducible local database and test commands.
- [ ] Production email transport and validated configuration.
- [ ] Secure runtime and integrated feature registration.
- [ ] Deployment/CI/backup/restore/incident documentation.
- [ ] Whole-project verification and code review.
- [ ] Canonical project status updated to current evidence.
