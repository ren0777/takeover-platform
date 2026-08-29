# TakeOver.com Engineering Constitution

> **Status:** These rules are **IMPLEMENTED NOW** as project policy. Phase 0 TypeScript, lint, formatting, test, and boundary enforcement is verified; product-domain enforcement remains **PLANNED** with its features.

## Correctness Rules

1. TypeScript strict mode is the default.
2. PostgreSQL is the authoritative source of durable product state.
3. Store money as integer minor currency units; never use floating-point arithmetic for money.
4. Validate untrusted input on the server.
5. Authorize every protected action from stored identity and membership state.
6. Enforce critical invariants with database constraints as well as application checks.
7. Financial and ownership changes are transactional.
8. Payment webhooks are signature-verified, recorded, replay-safe, and idempotent.
9. Never fake payment, verification, ownership, ranking, or battle success.
10. Never expose secrets to browser bundles, shared browser-safe packages, logs, or error bodies.
11. Do not duplicate domain rules across routes, clients, or providers.
12. Do not trust frontend-calculated bid totals or allow the frontend to choose ownership.
13. Never silently catch errors; translate or propagate them with context.
14. Use structured logs with request/event context.
15. Commit migrations with the code that depends on them.
16. Put configurable game rules behind one documented configuration/domain boundary.
17. Put external providers behind interfaces.
18. Write unit and integration tests for high-risk logic; financial workflows require integration tests.
19. Do not claim a feature works until current verification proves it.
20. Label unfinished integrations and unvalidated assumptions explicitly.
21. Preserve compatible API contracts when reasonable and document breaking changes.
22. Inspect another agent's code and `docs/MEMORY.md` before changing shared contracts.
23. Avoid unrelated rewrites; optimize for correctness before cleverness.

## Repository Boundaries

- `apps/web`: Next.js presentation and frontend orchestration. It never imports `@takeover/database`.
- `apps/api`: Fastify transport, server runtime, backend modules, integrations, and application services.
- `packages/shared`: browser/server-safe Zod contracts, inferred types, constants, and pure primitives. It never imports Fastify, Prisma, secrets, or Node-only APIs.
- `packages/database`: sole owner of Prisma schema, migrations, generated client, and client lifecycle.
- `packages/config`: shared build-time configuration only; no runtime business settings.
- `docs`: canonical requirements, architecture, phase status, UX policy, and handoff context.

Future API modules are feature-local under `apps/api/src/modules/<feature>/` and contain only necessary route, schema, service/domain, repository, integration, and test files. Do not create empty layers or Nest-style dependency-injection ceremony.

## Naming Conventions

- Workspace packages: `@takeover/<name>`.
- TypeScript files: lowercase kebab-case unless a framework requires a specific name.
- Types/classes/components: `PascalCase`; functions/variables: `camelCase`; constants: `UPPER_SNAKE_CASE` when truly constant.
- Database tables/columns: `snake_case`, mapped explicitly from readable Prisma models/fields.
- URLs and route segments: lowercase kebab-case; public identifiers use stable slugs or opaque IDs.
- Environment variables: uppercase snake case, validated once at the process boundary.
- Test names describe observable behavior, not implementation methods.

## Service and Data Conventions

- Route handlers are thin: parse, authenticate, authorize, call one application operation, translate the result.
- Business decisions live in testable domain/services independent of HTTP.
- Repositories isolate Prisma queries and transaction-bound data access.
- A transaction-sensitive service receives the transaction client it must use; it must not silently escape to a global client.
- Never create `PrismaClient` outside `packages/database`.
- Timestamps are UTC and stored with timezone-aware database types.
- Durable records use created/updated timestamps; immutable event records are append-oriented.
- Critical uniqueness, foreign keys, status constraints, and valid-value constraints belong in migrations.

## API Conventions

Success:

```json
{ "data": {}, "meta": {} }
```

Error:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe human message",
    "requestId": "request-id",
    "details": {}
  }
}
```

- Omit optional envelope fields when absent.
- Money fields end in `Minor` and accompany an ISO 4217 uppercase currency code.
- JSON dates use ISO 8601 UTC strings.
- Pagination, idempotency, and version semantics must be explicit in each stable contract.
- Never expose stack traces, provider secrets, raw SQL errors, or internal credentials.
- Record old/new behavior and required frontend changes in `docs/MEMORY.md` for contract changes.

## Logging Conventions

- Emit structured JSON in deployed services through Fastify/Pino.
- Prefer stable fields such as `event`, `requestId`, `userId`, `companyId`, `territoryId`, `bidId`, `paymentId`, and `webhookEventId`.
- Redact authorization, cookies, passwords, tokens, provider signatures, and credential-bearing URLs.
- Log once at the layer that can add actionable context; avoid duplicate stack spam.
- Audit logs are durable domain records and are not interchangeable with operational application logs.

## Validation, Security, and Provider Rules

- Zod is appropriate for transport/domain boundary validation; database constraints remain necessary.
- Validate and normalize URLs. Protect any server-side URL fetch against SSRF, redirects, private networks, DNS rebinding, size, and time limits.
- Use secure, HTTP-only, same-site cookies and CSRF protection when cookie-based mutation endpoints exist.
- Apply endpoint-specific request-size and rate limits before public launch.
- Provider webhook code verifies the raw signed payload before parsing trusted fields.
- Provider metadata is a locator, never proof of amount, currency, ownership, or authorization.
- Secrets come from validated server environment variables or managed secret stores.

## Testing Conventions

- Follow red-green-refactor for behavior code.
- Pure domain rules get deterministic unit tests.
- HTTP contracts use Fastify injection tests.
- Persistence, transaction, concurrency, webhook, and migration behavior use PostgreSQL integration tests.
- Test success, expected rejection, authorization denial, idempotency, replay, and race behavior.
- Avoid tests that merely assert mocks were called when observable behavior can be tested.
- A passing unit suite cannot substitute for required provider or database integration evidence.

## Environment and Migration Conventions

- Commit `.env.example` with safe illustrative values only; never commit `.env` or credentials.
- Validate runtime configuration before listening.
- Environment variables configure infrastructure/provider endpoints and secrets, not scattered game rules.
- Migrations are forward, reviewed, deterministic, and tested on representative PostgreSQL.
- Destructive/backfill migrations require a rollout and rollback/recovery plan.

## Git and Collaboration Conventions

- Use small coherent commits with conventional prefixes such as `feat:`, `fix:`, `test:`, `docs:`, and `chore:`.
- Never commit generated build output, secrets, local databases, or dependency folders.
- Check `git status --short` before editing and preserve unrelated changes.
- Update `MEMORY.md` after meaningful backend work and when shared contracts change.
- `MEMORY.md` is curated shared context, not a raw activity log.
- Do not mark a phase complete without its acceptance criteria and test evidence.
