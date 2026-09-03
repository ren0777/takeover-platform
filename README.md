# TakeOver.com

> **See territory → beat current price → capture territory → defend it → build an empire.**

TakeOver.com is a competitive marketplace game where verified companies capture and defend named internet territories. It is not a directory or an ad-inventory grid — territory ownership is scarce, time-bound, publicly visible, and won by beating the current price in the open.

Companies get a shareable, defensible category position. Visitors get a live, legible map of who dominates which internet category, and why. Every dollar, capture, and defense is auditable server-side — nothing about price, ownership, or verification is ever decided by the client.

## Project status

This repository documents its own truth honestly: every doc states whether a capability is **IMPLEMENTED NOW**, **PLANNED**, or **UNVALIDATED / NEEDS REVIEW**. Nothing here claims to work unless it has passed an acceptance suite.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Monorepo foundation, shared tooling, health endpoints | ✅ Implemented & verified |
| 1 | Company/contact identity, passwordless verification, company-scoped management sessions | ✅ Implemented & verified |
| 2 | Territories, authoritative ownership history | 🚧 Designed, not implemented |
| 3 | Capture engine — pricing, payments (Dodo), webhooks, atomic ownership transfer | 🚧 Frontend implemented & tested; backend capture engine in progress |
| 4 | Empire scoring, rankings, live activity feed | 📋 Planned |
| 5 | Seasons, rollover, Hall of Fame | 📋 Planned |
| 6 | Battles (rivalry state machine) | 📋 Planned / needs review |
| 7 | Sharing, Open Graph, referrals | 📋 Planned |
| 8 | Admin, moderation, audited operator tools | 📋 Planned |
| 9 | Production hardening & launch readiness | 📋 Planned |

Full breakdown with acceptance criteria and evidence: [docs/PHASES.md](docs/PHASES.md).

Notably, V1 has **no user accounts, passwords, or login pages**. Authority to manage a company comes from a verified email contact plus a company-scoped management grant — never from a payment, a website match, or a browser return URL. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how that identity model works end to end.

## Why it's built this way

- **Server is the only source of truth.** Price, ownership, verification, and scores are computed and validated in the backend. The client can display a quote but can never lock a price or grant itself authority.
- **No accounts, no passwords.** Company identity is separate from management authority; authority is granted through single-use, expiring, purpose-bound email capabilities exchanged for short-lived company-scoped sessions.
- **Ownership is one table, one truth.** `TerritoryOwnership` is the sole record of who holds a territory; PostgreSQL constraints (not application code) guarantee exactly one active reign per territory with non-overlapping history.
- **Payments can never race ahead of authorization.** A confirmed payment that can't legally produce a capture goes to explicit reconciliation, not a silent ownership change.

## Tech stack

- **Monorepo:** pnpm workspaces
- **Web:** Next.js 15, React 19
- **API:** Fastify 5, TypeScript
- **Database:** PostgreSQL 17, Prisma 7 (`@takeover/database` is the sole Prisma owner)
- **Contracts:** Zod schemas shared between web and API (`@takeover/shared`)
- **Payments (planned, Phase 3):** provider-neutral interface with Dodo Payments as the first adapter

## Repository layout

```
apps/
  web/          Next.js frontend — presentation only, never imports the database
  api/          Fastify backend — routes are thin; services own decisions; repositories own Prisma queries
packages/
  database/     Prisma schema, migrations, generated client (server-only)
  shared/       Framework-neutral Zod contracts used by both apps
  config/       Shared build-time TypeScript/ESLint configuration
docs/           Product requirements, architecture, phased delivery plan, and design specs
scripts/        Operational scripts (e.g. API smoke test)
```

## Getting started

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 10, a local PostgreSQL 17 instance.

```bash
pnpm install
cp .env.example .env   # then fill in real secrets for anything beyond local dev

pnpm db:generate        # generate the Prisma client
pnpm db:validate        # validate the schema against the database

pnpm dev                # runs @takeover/web (:3000) and @takeover/api (:4000) in parallel
```

Common workspace commands (each also runs per-package via `--filter`):

```bash
pnpm typecheck           # TypeScript across every workspace
pnpm lint                # ESLint across every workspace
pnpm test                # unit tests
pnpm test:integration     # integration tests (requires PostgreSQL)
pnpm build               # production builds for web and api
pnpm smoke:api            # boots the compiled API and checks /health and /ready
```

## Documentation

The canonical docs are the actual source of truth for scope and design — read them before assuming a feature exists:

- [docs/PRD.md](docs/PRD.md) — product vision, user journeys, functional requirements, non-goals
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, sequence diagrams, data model, security model
- [docs/PHASES.md](docs/PHASES.md) — delivery phases with dependencies, acceptance criteria, and verification evidence
- [docs/DESIGN.md](docs/DESIGN.md) / [docs/PHASE3_DESIGN.md](docs/PHASE3_DESIGN.md) — detailed design specs for specific phases
- [docs/DODO_INTEGRATION.md](docs/DODO_INTEGRATION.md) — what Dodo Payments' public docs confirm vs. leave unknown; tracked before any Dodo-specific code is written
- [docs/RULES.md](docs/RULES.md) — engineering rules and invariants this codebase holds itself to

## Contributing

This is an early-stage, phase-gated build: each phase has a written design, an implementation plan, and an acceptance suite that must pass with real evidence (including PostgreSQL integration tests) before it's considered done. If you're picking up work here, start with [docs/PHASES.md](docs/PHASES.md) to see what's actually implemented versus planned.
